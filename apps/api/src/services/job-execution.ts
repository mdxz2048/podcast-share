import { FastifyInstance } from "fastify";
import { env } from "../config.js";
import { decryptSecret } from "../utils/secrets.js";
import { applyRunnerEvents } from "./import-processing.js";
import { assertTransition, type JobStatus } from "../utils/job-state.js";

type SourceExecutionContext = {
  sourceId: string;
  sourceName: string;
  sourceEnabled: boolean;
  authStatus: string;
  authUnattendedReady: boolean;
  connectorId: string;
  connectorVersionId: string;
  packagePath: string;
  manifestJson: Record<string, unknown>;
  inputConfig: Record<string, unknown>;
  secretConfig: Record<string, string>;
};

type TriggerType = "manual" | "scheduled" | "resume";

function resolveWaitingStatus(events: Array<Record<string, unknown>>, fallback: JobStatus): JobStatus {
  const hasAuthRequired = events.some((event) => event.type === "auth_required");
  if (hasAuthRequired) {
    return "waiting_for_auth";
  }

  const hasInputRequired = events.some((event) => event.type === "input_required");
  if (hasInputRequired) {
    return "waiting_for_input";
  }

  return fallback;
}

export async function transitionJobStatus(app: FastifyInstance, jobId: string, to: JobStatus): Promise<void> {
  const currentRes = await app.pg.query("select status from import_jobs where id = $1", [jobId]);
  if ((currentRes.rowCount ?? 0) === 0) {
    throw new Error("job not found");
  }

  const from = currentRes.rows[0].status as JobStatus;
  assertTransition(from, to);

  await app.pg.query("update import_jobs set status = $1, updated_at = now() where id = $2", [to, jobId]);
}

async function loadSourceExecutionContext(app: FastifyInstance, sourceId: string): Promise<SourceExecutionContext | null> {
  const sourceRes = await app.pg.query(
    `select s.id, s.name, s.enabled, s.auth_status, s.auth_unattended_ready,
            s.connector_id, s.connector_version_id,
            cv.package_path, cv.manifest_json,
            csc.config_json
     from connector_sources s
     join connector_versions cv on cv.id = s.connector_version_id
     left join connector_source_configs csc on csc.source_id = s.id
     where s.id = $1`,
    [sourceId]
  );

  if ((sourceRes.rowCount ?? 0) === 0) {
    return null;
  }

  const source = sourceRes.rows[0];
  const secretRows = await app.pg.query(
    `select ssb.secret_key, sr.cipher_text
     from source_secret_bindings ssb
     join secret_records sr on sr.id = ssb.secret_record_id
     where ssb.source_id = $1`,
    [sourceId]
  );

  const secretConfig: Record<string, string> = {};
  for (const row of secretRows.rows) {
    secretConfig[row.secret_key] = decryptSecret(row.cipher_text);
  }

  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceEnabled: source.enabled,
    authStatus: source.auth_status,
    authUnattendedReady: source.auth_unattended_ready,
    connectorId: source.connector_id,
    connectorVersionId: source.connector_version_id,
    packagePath: source.package_path,
    manifestJson: source.manifest_json as Record<string, unknown>,
    inputConfig: (source.config_json ?? {}) as Record<string, unknown>,
    secretConfig
  };
}

function mergeInput(baseInput: Record<string, unknown>, additionalInput?: Record<string, unknown>) {
  return {
    ...baseInput,
    ...(additionalInput ?? {})
  };
}

async function loadExistingExternalEpisodeIds(app: FastifyInstance, sourceId: string): Promise<string[]> {
  const res = await app.pg.query(
    `select e.external_episode_id
     from episodes e
     join programs p on p.id = e.program_id
     where p.source_id = $1
       and e.external_episode_id is not null
     order by e.created_at desc
     limit 10000`,
    [sourceId]
  );
  return res.rows.map((row) => row.external_episode_id).filter((value): value is string => typeof value === "string" && value.length > 0);
}

async function writeJobLog(
  app: FastifyInstance,
  jobId: string,
  message: string,
  payload: Record<string, unknown> = {},
  level: "info" | "warn" | "error" = "info"
): Promise<void> {
  await app.pg.query(
    `insert into import_job_events (id, job_id, event_type, level, message, payload_json, created_at)
     values (gen_random_uuid(), $1, 'job_log', $2, $3, $4::jsonb, now())`,
    [jobId, level, message, JSON.stringify(payload)]
  );
}

async function createJob(
  app: FastifyInstance,
  context: SourceExecutionContext,
  triggerType: TriggerType,
  createdBy: string | null,
  inputConfig: Record<string, unknown>
): Promise<string> {
  const inputSummary = {
    keys: Object.keys(inputConfig),
    sourceName: context.sourceName
  };

  const authSummary = {
    status: context.authStatus,
    secretKeys: Object.keys(context.secretConfig)
  };

  const jobRes = await app.pg.query(
    `insert into import_jobs (
        id, source_id, connector_id, connector_version_id, trigger_type, status,
        started_at, input_summary_json, auth_summary_json,
        created_by, created_at, updated_at
     ) values (
        gen_random_uuid(), $1, $2, $3, $4, 'queued',
        now(), $5::jsonb, $6::jsonb,
        $7, now(), now()
     ) returning id`,
    [
      context.sourceId,
      context.connectorId,
      context.connectorVersionId,
      triggerType,
      JSON.stringify(inputSummary),
      JSON.stringify(authSummary),
      createdBy
    ]
  );

  const jobId = jobRes.rows[0].id as string;
  await writeJobLog(app, jobId, `job created (${triggerType})`, {
    triggerType,
    sourceId: context.sourceId,
    sourceName: context.sourceName,
    connectorId: context.connectorId,
    connectorVersionId: context.connectorVersionId,
    inputKeys: Object.keys(inputConfig),
    secretKeys: Object.keys(context.secretConfig)
  });

  await app.pg.query(
    `insert into import_job_inputs (id, job_id, input_summary_json, created_at)
     values (gen_random_uuid(), $1, $2::jsonb, now())`,
    [jobId, JSON.stringify({ inputSummary, authSummary })]
  );

  return jobId;
}

export async function executeSourceImport(
  app: FastifyInstance,
  params: {
    sourceId: string;
    triggerType: TriggerType;
    createdBy: string | null;
    additionalInput?: Record<string, unknown>;
    existingJobId?: string;
  }
): Promise<{ jobId: string; status: JobStatus; summary: { programs: number; episodes: number; media: number; failed: number } }> {
  const context = await loadSourceExecutionContext(app, params.sourceId);
  if (!context) {
    throw new Error("source not found");
  }

  if (params.triggerType === "scheduled") {
    const manifestRunModes = (context.manifestJson.run_modes as { scheduled?: boolean } | undefined) ?? {};
    const minimumInterval =
      ((context.manifestJson.schedule as { minimum_interval_minutes?: number } | undefined)?.minimum_interval_minutes ?? 1) * 60 * 1000;

    if (!manifestRunModes.scheduled) {
      throw new Error("connector does not support scheduled mode");
    }
    if (!context.sourceEnabled) {
      throw new Error("source is disabled");
    }
    if (context.authStatus !== "configured" || !context.authUnattendedReady) {
      throw new Error("auth is not unattended-ready");
    }

    const lastRes = await app.pg.query("select started_at from import_jobs where source_id = $1 order by created_at desc limit 1", [params.sourceId]);
    if ((lastRes.rowCount ?? 0) > 0) {
      const lastStarted = new Date(lastRes.rows[0].started_at).getTime();
      if (Date.now() - lastStarted < minimumInterval) {
        throw new Error("minimum schedule interval not reached");
      }
    }
  }

  const runningRes = await app.pg.query(
    `select id from import_jobs
     where source_id = $1 and status in ('running', 'waiting_for_input', 'waiting_for_auth')
     limit 1`,
    [params.sourceId]
  );

  if ((runningRes.rowCount ?? 0) > 0) {
    if (!params.existingJobId || runningRes.rows[0].id !== params.existingJobId) {
      throw new Error("source has a running job");
    }
  }

  const existingExternalEpisodeIds = await loadExistingExternalEpisodeIds(app, params.sourceId);
  const mergedInput = {
    ...mergeInput(context.inputConfig, params.additionalInput),
    existing_external_episode_ids: existingExternalEpisodeIds
  };
  const jobId = params.existingJobId ?? (await createJob(app, context, params.triggerType, params.createdBy, mergedInput));

  if (params.existingJobId) {
    const progressRes = await app.pg.query("select progress_json from import_jobs where id = $1", [jobId]);
    const currentProgress = ((progressRes.rows[0]?.progress_json ?? {}) as Record<string, unknown>) || {};
    await app.pg.query("update import_jobs set progress_json = $1::jsonb, updated_at = now() where id = $2", [
      JSON.stringify({
        ...currentProgress,
        resumeInputKeys: Object.keys(params.additionalInput ?? {})
      }),
      jobId
    ]);
  }

  await transitionJobStatus(app, jobId, "running");
  await writeJobLog(app, jobId, "job status changed to running", {
    triggerType: params.triggerType,
    packagePath: context.packagePath
  });

  const runnerEventCallbackBaseUrl = env.RUNNER_EVENT_CALLBACK_BASE_URL ?? env.API_BASE_URL;
  await writeJobLog(app, jobId, "calling runner internal run endpoint", {
    runnerBaseUrl: env.RUNNER_BASE_URL,
    eventCallbackBaseUrl: runnerEventCallbackBaseUrl
  });

  const runnerResponse = await fetch(`${env.RUNNER_BASE_URL}/internal/run-import`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jobId,
      packagePath: context.packagePath,
      manifest: context.manifestJson,
      inputConfig: mergedInput,
      secretConfig: context.secretConfig,
      eventCallbackUrl: `${runnerEventCallbackBaseUrl}/internal/runner/jobs/${jobId}/events`,
      eventCallbackToken: env.RUNNER_INTERNAL_TOKEN
    })
  });

  const runnerJson = await runnerResponse.json();
  await writeJobLog(app, jobId, "runner response received", {
    ok: runnerResponse.ok,
    status: runnerJson.status ?? null,
    events: Array.isArray(runnerJson.events) ? runnerJson.events.length : 0,
    copiedMediaCount: runnerJson.copiedMediaCount ?? 0
  }, runnerResponse.ok ? "info" : "error");

  if (!runnerResponse.ok) {
    await app.pg.query(
      `update import_jobs
       set status = 'failed', ended_at = now(), error_summary = $1, updated_at = now()
       where id = $2`,
      [runnerJson.message ?? "runner execute failed", jobId]
    );
    await app.pg.query("update connector_sources set last_job_status = 'failed', updated_at = now() where id = $1", [params.sourceId]);
    await writeJobLog(app, jobId, "runner execution failed", {
      message: runnerJson.message ?? "runner execute failed"
    }, "error");
    return {
      jobId,
      status: "failed",
      summary: { programs: 0, episodes: 0, media: 0, failed: 1 }
    };
  }

  const events = Array.isArray(runnerJson.events) ? (runnerJson.events as Array<Record<string, unknown>>) : [];
  const importSummary = await applyRunnerEvents(app, jobId, params.sourceId, events);
  await writeJobLog(app, jobId, "runner events imported", {
    eventCount: events.length,
    importSummary
  });

  const statusFromRunner = runnerJson.status === "completed" ? "completed" : runnerJson.status === "failed" ? "failed" : "running";
  const finalStatus = resolveWaitingStatus(events, statusFromRunner as JobStatus);

  const isTerminal = ["completed", "failed", "cancelled", "timeout"].includes(finalStatus);

  await app.pg.query(
    `update import_jobs
     set status = $1,
         ended_at = case when $2 then now() else ended_at end,
         output_summary_json = $3::jsonb,
         discovered_programs = $4,
         discovered_episodes = $5,
         imported_media = $6,
         failed_count = $7,
         error_summary = $8,
         updated_at = now()
     where id = $9`,
    [
      finalStatus,
      isTerminal,
      JSON.stringify({ runnerStatus: runnerJson.status, copiedMediaCount: runnerJson.copiedMediaCount ?? 0 }),
      importSummary.programs,
      importSummary.episodes,
      importSummary.media,
      importSummary.failed,
      runnerJson.stderr ?? null,
      jobId
    ]
  );
  await writeJobLog(app, jobId, "job finalized", {
    finalStatus,
    isTerminal,
    importSummary,
    errorSummary: runnerJson.stderr ?? null
  }, finalStatus === "failed" ? "error" : "info");

  await app.pg.query(
    `insert into import_job_outputs (id, job_id, output_summary_json, created_at)
     values (gen_random_uuid(), $1, $2::jsonb, now())`,
    [
      jobId,
      JSON.stringify({
        runnerStatus: runnerJson.status,
        finalStatus,
        importSummary
      })
    ]
  );

  await app.pg.query(
    `update connector_sources
     set last_job_status = $1,
         last_success_sync_at = case when $1 = 'completed' then now() else last_success_sync_at end,
         updated_at = now()
     where id = $2`,
    [finalStatus, params.sourceId]
  );

  return {
    jobId,
    status: finalStatus,
    summary: importSummary
  };
}
