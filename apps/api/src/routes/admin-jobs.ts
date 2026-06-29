import { FastifyInstance } from "fastify";
import { z } from "zod";
import { executeSourceImport } from "../services/job-execution.js";

function assertAdmin(request: { user: { id: string; isAdmin: boolean } | null }, reply: any): request is { user: { id: string; isAdmin: boolean } } {
  if (!request.user || !request.user.isAdmin) {
    reply.status(401).send({ message: "未登录管理员" });
    return false;
  }
  return true;
}

function normalizeJobEvent(row: {
  event_type: string;
  level: string | null;
  message: string | null;
  payload_json: Record<string, unknown> | null;
  created_at: string;
}) {
  if ((row.event_type !== "runner_stdout" && row.event_type !== "runner_stderr") || !row.message) {
    return row;
  }

  try {
    const parsed = JSON.parse(row.message) as { type?: unknown; level?: unknown; message?: unknown };
    if (typeof parsed.message === "string") {
      if (parsed.type === "auth_update") {
        return {
          ...row,
          event_type: "auth_update",
          level: typeof parsed.level === "string" ? parsed.level : row.level,
          message: parsed.message,
          payload_json: {
            ...(row.payload_json ?? {}),
            ...parsed,
            value: "[redacted]",
            secret_value: "[redacted]"
          }
        };
      }

      if (parsed.type === "qr_image") {
        return {
          ...row,
          event_type: "qr_image",
          level: typeof parsed.level === "string" ? parsed.level : row.level,
          message: parsed.message,
          payload_json: {
            ...(row.payload_json ?? {}),
            ...parsed
          }
        };
      }

      return {
        ...row,
        level: typeof parsed.level === "string" ? parsed.level : row.level,
        message: parsed.message,
        payload_json: {
          ...(row.payload_json ?? {}),
          connectorEvent: parsed
        }
      };
    }
  } catch {
    // Existing plain output is already normalized.
  }

  return row;
}

export async function adminJobRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/jobs", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const query = z.object({ sourceId: z.string().uuid().optional() }).parse(request.query ?? {});

    const rows = await app.pg.query(
      `select j.id, j.status, j.trigger_type, j.started_at, j.ended_at,
              j.discovered_programs, j.discovered_episodes, j.imported_media,
              j.failed_count, j.error_summary, j.created_at,
              s.id as source_id, s.name as source_name,
              c.display_name as connector_display_name, cv.version as connector_version
       from import_jobs j
       join connector_sources s on s.id = j.source_id
       join connectors c on c.id = j.connector_id
       join connector_versions cv on cv.id = j.connector_version_id
       where ($1::uuid is null or j.source_id = $1)
       order by j.created_at desc
       limit 200`,
      [query.sourceId ?? null]
    );

    return {
      items: rows.rows.map((row) => ({
        id: row.id,
        status: row.status,
        triggerType: row.trigger_type,
        startedAt: row.started_at,
        endedAt: row.ended_at,
        discoveredPrograms: row.discovered_programs,
        discoveredEpisodes: row.discovered_episodes,
        importedMedia: row.imported_media,
        failedCount: row.failed_count,
        errorSummary: row.error_summary,
        createdAt: row.created_at,
        source: {
          id: row.source_id,
          name: row.source_name
        },
        connector: {
          displayName: row.connector_display_name,
          version: row.connector_version
        }
      }))
    };
  });

  app.get("/admin/jobs/:jobId", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(request.params);

    const jobRes = await app.pg.query(
      `select j.*, s.name as source_name, c.display_name as connector_display_name, cv.version as connector_version
       from import_jobs j
       join connector_sources s on s.id = j.source_id
       join connectors c on c.id = j.connector_id
       join connector_versions cv on cv.id = j.connector_version_id
       where j.id = $1`,
      [jobId]
    );

    if ((jobRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "任务不存在" });
    }

    const eventsRes = await app.pg.query(
      `select event_type, level, message, payload_json, created_at
       from import_job_events
       where job_id = $1
       order by created_at asc`,
      [jobId]
    );

    const inputsRes = await app.pg.query(
      `select input_summary_json, created_at
       from import_job_inputs
       where job_id = $1
       order by created_at desc
       limit 1`,
      [jobId]
    );

    const outputsRes = await app.pg.query(
      `select output_summary_json, created_at
       from import_job_outputs
       where job_id = $1
       order by created_at desc
       limit 1`,
      [jobId]
    );

    const job = jobRes.rows[0];
    return {
      id: job.id,
      status: job.status,
      triggerType: job.trigger_type,
      startedAt: job.started_at,
      endedAt: job.ended_at,
      sourceName: job.source_name,
      connectorDisplayName: job.connector_display_name,
      connectorVersion: job.connector_version,
      inputSummary: job.input_summary_json,
      authSummary: job.auth_summary_json,
      outputSummary: job.output_summary_json,
      discoveredPrograms: job.discovered_programs,
      discoveredEpisodes: job.discovered_episodes,
      importedMedia: job.imported_media,
      failedCount: job.failed_count,
      errorSummary: job.error_summary,
      latestInputSnapshot: (inputsRes.rowCount ?? 0) > 0 ? inputsRes.rows[0] : null,
      latestOutputSnapshot: (outputsRes.rowCount ?? 0) > 0 ? outputsRes.rows[0] : null,
      events: eventsRes.rows.map(normalizeJobEvent)
    };
  });

  app.post("/admin/jobs/:jobId/cancel", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(request.params);

    const jobRes = await app.pg.query("select status from import_jobs where id = $1", [jobId]);
    if ((jobRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "任务不存在" });
    }

    const status = jobRes.rows[0].status as string;
    if (!["queued", "running", "waiting_for_input", "waiting_for_auth"].includes(status)) {
      return reply.status(400).send({ message: "当前状态不支持取消" });
    }

    await app.pg.query(
      `update import_jobs
       set status = 'cancelled', ended_at = now(), updated_at = now()
       where id = $1`,
      [jobId]
    );

    await app.pg.query(
      `insert into import_job_events (id, job_id, event_type, level, message, payload_json, created_at)
       values (gen_random_uuid(), $1, 'cancelled', 'info', 'job cancelled by admin', '{}'::jsonb, now())`,
      [jobId]
    );

    return { message: "任务已取消" };
  });

  app.post("/admin/jobs/:jobId/submit-input", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(request.params);
    const body = z.object({ input: z.record(z.any()) }).parse(request.body);

    const jobRes = await app.pg.query("select status, source_id from import_jobs where id = $1", [jobId]);
    if ((jobRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "任务不存在" });
    }

    const status = jobRes.rows[0].status as string;
    if (!["waiting_for_input", "waiting_for_auth"].includes(status)) {
      return reply.status(400).send({ message: "任务当前不需要输入" });
    }

    const sourceId = jobRes.rows[0].source_id as string;

    await app.pg.query(
      `insert into import_job_events (id, job_id, event_type, level, message, payload_json, created_at)
       values (gen_random_uuid(), $1, 'input_submitted', 'info', 'admin submitted input', $2::jsonb, now())`,
      [jobId, JSON.stringify({ keys: Object.keys(body.input) })]
    );

    try {
      const result = await executeSourceImport(app, {
        sourceId,
        triggerType: "resume",
        createdBy: request.user.id,
        additionalInput: body.input,
        existingJobId: jobId
      });

      return {
        message: "输入已提交并恢复执行",
        jobId,
        status: result.status,
        summary: result.summary
      };
    } catch (error) {
      return reply.status(400).send({ message: error instanceof Error ? error.message : "恢复执行失败" });
    }
  });
}
