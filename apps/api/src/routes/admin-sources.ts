import { FastifyInstance } from "fastify";
import { dirname, resolve, sep } from "node:path";
import { rmdir, unlink } from "node:fs/promises";
import { z } from "zod";
import { decryptSecret, encryptSecret } from "../utils/secrets.js";
import { executeSourceImport } from "../services/job-execution.js";
import { env } from "../config.js";

function assertAdmin(request: { user: { id: string; isAdmin: boolean } | null }, reply: any): request is { user: { id: string; isAdmin: boolean } } {
  if (!request.user || !request.user.isAdmin) {
    reply.status(401).send({ message: "未登录管理员" });
    return false;
  }
  return true;
}

type ManifestLike = {
  run_modes?: { scheduled?: boolean };
  schedule?: { minimum_interval_minutes?: number };
  authentication?: { modes?: string[]; unattended_supported?: boolean };
  inputs?: Array<{ key: string }>;
  secrets?: Array<{ key: string }>;
};

function splitConfigByManifest(manifest: ManifestLike, inputConfig: Record<string, unknown>, secretConfig: Record<string, string>) {
  const allowedInputs = new Set((manifest.inputs ?? []).map((item) => item.key));
  const allowedSecrets = new Set((manifest.secrets ?? []).map((item) => item.key));

  const normalizedInputs: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputConfig)) {
    if (allowedInputs.has(key)) {
      normalizedInputs[key] = value;
    }
  }

  const normalizedSecrets: Record<string, string> = {};
  for (const [key, value] of Object.entries(secretConfig)) {
    if (allowedSecrets.has(key)) {
      normalizedSecrets[key] = value;
    }
  }

  return {
    inputs: normalizedInputs,
    secrets: normalizedSecrets
  };
}

function hasBundledUnattendedAuth(manifest: ManifestLike) {
  const modes = Array.isArray(manifest.authentication?.modes) ? manifest.authentication.modes : [];
  return manifest.authentication?.unattended_supported === true && modes.includes("bundled_session");
}

function parseIntervalHours(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 6;
  }
  return Math.min(168, Math.max(1, Math.trunc(parsed)));
}

function computeNextRunAt(scheduleType: string, cronExpression: string | null): Date {
  const now = new Date();
  if (scheduleType === "interval_hours") {
    return new Date(now.getTime() + parseIntervalHours(cronExpression) * 60 * 60 * 1000);
  }
  if (scheduleType === "hourly") {
    return new Date(now.getTime() + 60 * 60 * 1000);
  }
  if (scheduleType === "every_6_hours") {
    return new Date(now.getTime() + 6 * 60 * 60 * 1000);
  }
  if (scheduleType === "daily") {
    return new Date(now.getTime() + 24 * 60 * 60 * 1000);
  }
  if (scheduleType === "weekly") {
    return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  if (scheduleType === "cron" && cronExpression) {
    // v1 简化实现：cron 先按 1 小时推进，后续可替换为完整 cron parser。
    return new Date(now.getTime() + 60 * 60 * 1000);
  }
  return new Date(now.getTime() + 60 * 60 * 1000);
}

function resolveMediaPath(storageKey: string): string | null {
  const mediaRoot = resolve(process.cwd(), env.MEDIA_LOCAL_ROOT);
  const absolutePath = resolve(mediaRoot, storageKey);
  if (absolutePath !== mediaRoot && absolutePath.startsWith(`${mediaRoot}${sep}`)) {
    return absolutePath;
  }
  return null;
}

async function pruneEmptyMediaDirs(startDir: string): Promise<void> {
  const mediaRoot = resolve(process.cwd(), env.MEDIA_LOCAL_ROOT);
  let currentDir = startDir;

  while (currentDir !== mediaRoot && currentDir.startsWith(`${mediaRoot}${sep}`)) {
    try {
      await rmdir(currentDir);
    } catch {
      return;
    }
    currentDir = dirname(currentDir);
  }
}

async function deleteLocalMediaFiles(storageKeys: string[]): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;

  for (const storageKey of Array.from(new Set(storageKeys))) {
    const absolutePath = resolveMediaPath(storageKey);
    if (!absolutePath) {
      failed += 1;
      continue;
    }

    try {
      await unlink(absolutePath);
      deleted += 1;
      await pruneEmptyMediaDirs(dirname(absolutePath));
    } catch (error: any) {
      if (error?.code === "ENOENT") {
        continue;
      }
      failed += 1;
    }
  }

  return { deleted, failed };
}

export async function adminSourceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/sources", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const rows = await app.pg.query(
      `select s.id, s.name, s.enabled, s.auth_status, s.auth_unattended_ready, s.run_policy,
              s.last_success_sync_at, s.last_job_status, s.created_at, s.updated_at,
              c.id as connector_id, c.name as connector_name, c.display_name as connector_display_name,
              cv.id as connector_version_id, cv.version as connector_version,
              sched.id as schedule_id, sched.enabled as schedule_enabled, sched.paused as schedule_paused,
              sched.schedule_type, sched.cron_expression, sched.next_run_at,
              sched.last_run_at, sched.last_success_at, sched.last_error_at,
              active_job.id as active_job_id, active_job.status as active_job_status,
              coalesce(job_usage.job_count, 0)::int as job_count,
              coalesce(content_stats.program_count, 0)::int as program_count,
              coalesce(content_stats.episode_count, 0)::int as episode_count,
              coalesce(content_stats.media_count, 0)::int as media_count,
              coalesce(content_stats.media_bytes, 0)::bigint as media_bytes
       from connector_sources s
       join connectors c on c.id = s.connector_id
       join connector_versions cv on cv.id = s.connector_version_id
       left join lateral (
         select id, enabled, paused, schedule_type, cron_expression,
                next_run_at, last_run_at, last_success_at, last_error_at
         from schedules
         where source_id = s.id
         order by created_at desc
         limit 1
       ) sched on true
       left join lateral (
         select j.id, j.status
         from import_jobs j
         where j.source_id = s.id
           and j.status in ('queued', 'running', 'waiting_for_input', 'waiting_for_auth')
         order by j.created_at desc
         limit 1
       ) active_job on true
       left join lateral (
         select count(*) as job_count
         from import_jobs j
         where j.source_id = s.id
       ) job_usage on true
       left join lateral (
         select count(distinct p.id) as program_count,
                count(distinct e.id) as episode_count,
                count(distinct m.id) as media_count,
                coalesce(sum(m.size_bytes), 0) as media_bytes
         from programs p
         left join episodes e on e.program_id = p.id
         left join media_assets m on m.episode_id = e.id and m.status = 'ready'
         where p.source_id = s.id and p.is_archived = false
       ) content_stats on true
       order by s.updated_at desc`
    );

    return {
      items: rows.rows.map((row) => ({
        id: row.id,
        name: row.name,
        enabled: row.enabled,
        authStatus: row.auth_status,
        authUnattendedReady: row.auth_unattended_ready,
        runPolicy: row.run_policy,
        lastSuccessSyncAt: row.last_success_sync_at,
        lastJobStatus: row.last_job_status,
        jobCount: row.job_count,
        activeJob: row.active_job_id
          ? {
              id: row.active_job_id,
              status: row.active_job_status
            }
          : null,
        inUse: Boolean(row.active_job_id),
        stats: {
          programs: row.program_count,
          episodes: row.episode_count,
          media: row.media_count,
          mediaBytes: Number(row.media_bytes)
        },
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        connector: {
          id: row.connector_id,
          name: row.connector_name,
          displayName: row.connector_display_name,
          versionId: row.connector_version_id,
          version: row.connector_version
        },
        schedule: row.schedule_id
          ? {
              id: row.schedule_id,
              enabled: row.schedule_enabled,
              paused: row.schedule_paused,
              scheduleType: row.schedule_type,
              intervalHours: row.schedule_type === "interval_hours" ? parseIntervalHours(row.cron_expression) : null,
              nextRunAt: row.next_run_at,
              lastRunAt: row.last_run_at,
              lastSuccessAt: row.last_success_at,
              lastErrorAt: row.last_error_at
            }
          : null
      }))
    };
  });

  app.post("/admin/sources", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const body = z
      .object({
        connectorVersionId: z.string().uuid(),
        name: z.string().min(1).max(120),
        inputConfig: z.record(z.any()).default({}),
        secretConfig: z.record(z.string()).default({}),
        runPolicy: z.enum(["manual_only", "scheduled_allowed"]).default("manual_only")
      })
      .parse(request.body);

    const versionRes = await app.pg.query(
      `select cv.id, cv.connector_id, cv.manifest_json, c.status as connector_status, cv.status as version_status
       from connector_versions cv
       join connectors c on c.id = cv.connector_id
       where cv.id = $1`,
      [body.connectorVersionId]
    );

    if ((versionRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "Connector 版本不存在" });
    }

    const version = versionRes.rows[0];
    if (version.connector_status !== "enabled" || version.version_status !== "enabled") {
      return reply.status(400).send({ message: "Connector 未启用，不能创建 Source" });
    }

    const manifest = version.manifest_json as ManifestLike;
    const normalized = splitConfigByManifest(manifest, body.inputConfig, body.secretConfig);

    const sourceRes = await app.pg.query(
      `insert into connector_sources (
          id, connector_id, connector_version_id, name, enabled, auth_status,
          auth_unattended_ready, run_policy, created_by, created_at, updated_at
       ) values (
          gen_random_uuid(), $1, $2, $3, false, 'not_configured', false, $4, $5, now(), now()
       )
       returning id, name, run_policy`,
      [version.connector_id, version.id, body.name, body.runPolicy, request.user.id]
    );

    const source = sourceRes.rows[0];

    await app.pg.query(
      `insert into connector_source_configs (id, source_id, config_json, created_at, updated_at)
       values (gen_random_uuid(), $1, $2::jsonb, now(), now())`,
      [source.id, JSON.stringify(normalized.inputs)]
    );

    for (const [secretKey, secretValue] of Object.entries(normalized.secrets)) {
      const secretCipher = encryptSecret(secretValue);
      const secretRes = await app.pg.query(
        `insert into secret_records (id, secret_kind, cipher_text, key_version, status, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, 'v1', 'configured', now(), now())
         returning id`,
        [secretKey, secretCipher]
      );

      await app.pg.query(
        `insert into source_secret_bindings (source_id, secret_key, secret_record_id, created_at, updated_at)
         values ($1, $2, $3, now(), now())`,
        [source.id, secretKey, secretRes.rows[0].id]
      );
    }

    const authConfigured = Object.keys(normalized.secrets).length > 0 || hasBundledUnattendedAuth(manifest);
    await app.pg.query(
      `update connector_sources
       set auth_status = $1, auth_unattended_ready = $2, updated_at = now()
       where id = $3`,
      [authConfigured ? "configured" : "not_configured", authConfigured, source.id]
    );

    return reply.status(201).send({
      id: source.id,
      name: source.name,
      runPolicy: source.run_policy,
      authStatus: authConfigured ? "configured" : "not_configured"
    });
  });

  app.get("/admin/sources/:sourceId", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { sourceId } = z.object({ sourceId: z.string().uuid() }).parse(request.params);

    const sourceRes = await app.pg.query(
      `select s.id, s.name, s.enabled, s.auth_status, s.auth_unattended_ready, s.run_policy,
              s.last_success_sync_at, s.last_job_status, s.updated_at,
              c.id as connector_id, c.name as connector_name, c.display_name as connector_display_name,
              cv.id as connector_version_id, cv.version as connector_version,
              cv.manifest_json,
              csc.config_json,
              active_job.id as active_job_id, active_job.status as active_job_status,
              coalesce(content_stats.program_count, 0)::int as program_count,
              coalesce(content_stats.episode_count, 0)::int as episode_count,
              coalesce(content_stats.media_count, 0)::int as media_count,
              coalesce(content_stats.media_bytes, 0)::bigint as media_bytes,
              coalesce(job_stats.job_count, 0)::int as job_count
       from connector_sources s
       join connectors c on c.id = s.connector_id
       join connector_versions cv on cv.id = s.connector_version_id
       left join connector_source_configs csc on csc.source_id = s.id
       left join lateral (
         select j.id, j.status
         from import_jobs j
         where j.source_id = s.id
           and j.status in ('queued', 'running', 'waiting_for_input', 'waiting_for_auth')
         order by j.created_at desc
         limit 1
       ) active_job on true
       left join lateral (
         select count(distinct p.id) as program_count,
                count(distinct e.id) as episode_count,
                count(distinct m.id) as media_count,
                coalesce(sum(m.size_bytes), 0) as media_bytes
         from programs p
         left join episodes e on e.program_id = p.id
         left join media_assets m on m.episode_id = e.id and m.status = 'ready'
         where p.source_id = s.id and p.is_archived = false
       ) content_stats on true
       left join lateral (
         select count(*) as job_count
         from import_jobs j
         where j.source_id = s.id
       ) job_stats on true
       where s.id = $1`,
      [sourceId]
    );

    if ((sourceRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "Source 不存在" });
    }

    const secretRes = await app.pg.query(
      `select ssb.secret_key, sr.status, sr.updated_at
       from source_secret_bindings ssb
       join secret_records sr on sr.id = ssb.secret_record_id
       where ssb.source_id = $1
       order by ssb.secret_key asc`,
      [sourceId]
    );

    const scheduleRes = await app.pg.query(
      `select id, enabled, paused, schedule_type, cron_expression, minimum_interval_minutes,
              next_run_at, last_run_at, last_success_at, last_error_at, updated_at
       from schedules
       where source_id = $1
       order by created_at desc
       limit 1`,
      [sourceId]
    );

    const source = sourceRes.rows[0];
    return {
      id: source.id,
      name: source.name,
      enabled: source.enabled,
      authStatus: source.auth_status,
      authUnattendedReady: source.auth_unattended_ready,
      runPolicy: source.run_policy,
      lastSuccessSyncAt: source.last_success_sync_at,
      lastJobStatus: source.last_job_status,
      activeJob: source.active_job_id
        ? {
            id: source.active_job_id,
            status: source.active_job_status
          }
        : null,
      inUse: Boolean(source.active_job_id),
      updatedAt: source.updated_at,
      connector: {
        id: source.connector_id,
        name: source.connector_name,
        displayName: source.connector_display_name,
        versionId: source.connector_version_id,
        version: source.connector_version
      },
      stats: {
        programs: source.program_count,
        episodes: source.episode_count,
        media: source.media_count,
        mediaBytes: Number(source.media_bytes),
        jobs: source.job_count
      },
      manifest: source.manifest_json,
      inputConfig: source.config_json ?? {},
      secretStatus: secretRes.rows.map((row) => ({
        key: row.secret_key,
        status: row.status,
        updatedAt: row.updated_at
      })),
      schedule: (scheduleRes.rowCount ?? 0) > 0 ? scheduleRes.rows[0] : null
    };
  });

  app.patch("/admin/sources/:sourceId", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { sourceId } = z.object({ sourceId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).max(120).optional(),
        inputConfig: z.record(z.any()).optional(),
        secretConfig: z.record(z.string()).optional(),
        runPolicy: z.enum(["manual_only", "scheduled_allowed"]).optional()
      })
      .parse(request.body);

    const sourceRes = await app.pg.query(
      `select s.id, cv.manifest_json
       from connector_sources s
       join connector_versions cv on cv.id = s.connector_version_id
       where s.id = $1`,
      [sourceId]
    );

    if ((sourceRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "Source 不存在" });
    }

    const source = sourceRes.rows[0];

    if (body.name || body.runPolicy) {
      await app.pg.query(
        `update connector_sources
         set name = coalesce($1, name), run_policy = coalesce($2, run_policy), updated_at = now()
         where id = $3`,
        [body.name ?? null, body.runPolicy ?? null, sourceId]
      );
    }

    if (body.inputConfig) {
      const normalized = splitConfigByManifest(source.manifest_json as ManifestLike, body.inputConfig, {});
      await app.pg.query(
        `insert into connector_source_configs (id, source_id, config_json, created_at, updated_at)
         values (gen_random_uuid(), $1, $2::jsonb, now(), now())
         on conflict (source_id)
         do update set config_json = excluded.config_json, updated_at = now()`,
        [sourceId, JSON.stringify(normalized.inputs)]
      );
    }

    if (body.secretConfig) {
      const normalized = splitConfigByManifest(source.manifest_json as ManifestLike, {}, body.secretConfig);
      for (const [secretKey, secretValue] of Object.entries(normalized.secrets)) {
        const secretCipher = encryptSecret(secretValue);
        const secretRes = await app.pg.query(
          `insert into secret_records (id, secret_kind, cipher_text, key_version, status, created_at, updated_at)
           values (gen_random_uuid(), $1, $2, 'v1', 'configured', now(), now())
           returning id`,
          [secretKey, secretCipher]
        );

        await app.pg.query(
          `insert into source_secret_bindings (source_id, secret_key, secret_record_id, created_at, updated_at)
           values ($1, $2, $3, now(), now())
           on conflict (source_id, secret_key)
           do update set secret_record_id = excluded.secret_record_id, updated_at = now()`,
          [sourceId, secretKey, secretRes.rows[0].id]
        );
      }

      await app.pg.query(
        `update connector_sources
         set auth_status = 'configured', auth_unattended_ready = true, updated_at = now()
         where id = $1`,
        [sourceId]
      );
    }

    return { message: "Source 已更新" };
  });

  app.post("/admin/sources/:sourceId/enable", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { sourceId } = z.object({ sourceId: z.string().uuid() }).parse(request.params);

    const sourceRes = await app.pg.query("select id, enabled from connector_sources where id = $1", [sourceId]);
    if ((sourceRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "Source 不存在" });
    }
    if (sourceRes.rows[0].enabled) {
      return { message: "Source 已经是启用状态" };
    }

    await app.pg.query("update connector_sources set enabled = true, updated_at = now() where id = $1", [sourceId]);
    return { message: "Source 已启用" };
  });

  app.post("/admin/sources/:sourceId/run", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { sourceId } = z.object({ sourceId: z.string().uuid() }).parse(request.params);

    try {
      const result = await executeSourceImport(app, {
        sourceId,
        triggerType: "manual",
        createdBy: request.user.id
      });

      return {
        message: result.status === "completed" ? "任务完成" : "任务执行中",
        jobId: result.jobId,
        status: result.status,
        summary: result.summary
      };
    } catch (error) {
      return reply.status(400).send({ message: error instanceof Error ? error.message : "任务执行失败" });
    }
  });

  app.post("/admin/sources/:sourceId/auth", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { sourceId } = z.object({ sourceId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        mode: z.string().min(1),
        summary: z.string().optional(),
        unattendedReady: z.boolean().default(false)
      })
      .parse(request.body);

    const sourceRes = await app.pg.query("select id from connector_sources where id = $1", [sourceId]);
    if ((sourceRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "Source 不存在" });
    }

    await app.pg.query(
      `insert into auth_profiles (id, source_id, mode, status, summary, updated_at)
       values (gen_random_uuid(), $1, $2, 'configured', $3, now())
       on conflict (source_id)
       do update set mode = excluded.mode, status = excluded.status, summary = excluded.summary, updated_at = now()`,
      [sourceId, body.mode, body.summary ?? null]
    );

    await app.pg.query(
      `update connector_sources
       set auth_status = 'configured', auth_unattended_ready = $1, updated_at = now()
       where id = $2`,
      [body.unattendedReady, sourceId]
    );

    return { message: "认证状态已更新" };
  });

  app.post("/admin/sources/:sourceId/auth/submit-input", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { sourceId } = z.object({ sourceId: z.string().uuid() }).parse(request.params);
    const body = z.object({ input: z.record(z.string()) }).parse(request.body);

    const sourceRes = await app.pg.query(
      `select s.id, cv.manifest_json
       from connector_sources s
       join connector_versions cv on cv.id = s.connector_version_id
       where s.id = $1`,
      [sourceId]
    );
    if ((sourceRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "Source 不存在" });
    }

    const manifest = sourceRes.rows[0].manifest_json as ManifestLike;
    const normalized = splitConfigByManifest(manifest, {}, body.input);

    for (const [secretKey, secretValue] of Object.entries(normalized.secrets)) {
      const secretCipher = encryptSecret(secretValue);
      const secretRes = await app.pg.query(
        `insert into secret_records (id, secret_kind, cipher_text, key_version, status, created_at, updated_at)
         values (gen_random_uuid(), $1, $2, 'v1', 'configured', now(), now())
         returning id`,
        [secretKey, secretCipher]
      );

      await app.pg.query(
        `insert into source_secret_bindings (source_id, secret_key, secret_record_id, created_at, updated_at)
         values ($1, $2, $3, now(), now())
         on conflict (source_id, secret_key)
         do update set secret_record_id = excluded.secret_record_id, updated_at = now()`,
        [sourceId, secretKey, secretRes.rows[0].id]
      );
    }

    await app.pg.query(
      `update connector_sources
       set auth_status = 'configured', auth_unattended_ready = true, updated_at = now()
       where id = $1`,
      [sourceId]
    );

    return { message: "认证输入已提交" };
  });

  app.post("/admin/sources/:sourceId/schedule", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { sourceId } = z.object({ sourceId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        scheduleType: z.enum(["manual", "interval_hours", "hourly", "every_6_hours", "daily", "weekly", "cron"]),
        intervalHours: z.number().int().min(1).max(168).optional(),
        cronExpression: z.string().optional(),
        enabled: z.boolean().default(true)
      })
      .parse(request.body);

    const sourceRes = await app.pg.query(
      `select s.id, cv.manifest_json
       from connector_sources s
       join connector_versions cv on cv.id = s.connector_version_id
       where s.id = $1`,
      [sourceId]
    );

    if ((sourceRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "Source 不存在" });
    }

    const manifest = sourceRes.rows[0].manifest_json as ManifestLike;
    if (!manifest.run_modes?.scheduled) {
      return reply.status(400).send({ message: "该 Connector 不支持周期任务" });
    }

    if (body.scheduleType === "manual") {
      await app.pg.query("update connector_sources set run_policy = 'manual_only', updated_at = now() where id = $1", [sourceId]);
      await app.pg.query(
        `update schedules
         set enabled = false, paused = true, next_run_at = null, updated_at = now()
         where source_id = $1`,
        [sourceId]
      );
      return {
        message: "已切换为手动触发",
        schedule: null
      };
    }

    const minimumInterval = manifest.schedule?.minimum_interval_minutes ?? 60;
    const cronExpression =
      body.scheduleType === "interval_hours"
        ? String(parseIntervalHours(body.intervalHours ?? body.cronExpression))
        : body.scheduleType === "cron"
          ? body.cronExpression ?? "0 * * * *"
          : null;
    const nextRunAt = computeNextRunAt(body.scheduleType, cronExpression);

    await app.pg.query("update connector_sources set run_policy = 'scheduled_allowed', updated_at = now() where id = $1", [sourceId]);

    const scheduleRes = await app.pg.query(
      `insert into schedules (
          id, source_id, enabled, paused, schedule_type, cron_expression,
          minimum_interval_minutes, next_run_at, created_at, updated_at
       ) values (
          gen_random_uuid(), $1, $2, false, $3, $4,
          $5, $6, now(), now()
       )
       on conflict (source_id)
       do update set
         enabled = excluded.enabled,
         paused = false,
         schedule_type = excluded.schedule_type,
         cron_expression = excluded.cron_expression,
         minimum_interval_minutes = excluded.minimum_interval_minutes,
         next_run_at = excluded.next_run_at,
         updated_at = now()
       returning id, source_id, enabled, paused, schedule_type, cron_expression, minimum_interval_minutes, next_run_at`,
      [sourceId, body.enabled, body.scheduleType, cronExpression, minimumInterval, nextRunAt]
    );

    return {
      message: "周期任务已保存",
      schedule: scheduleRes.rows[0]
    };
  });

  app.patch("/admin/schedules/:scheduleId", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { scheduleId } = z.object({ scheduleId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        enabled: z.boolean().optional(),
        scheduleType: z.enum(["interval_hours", "hourly", "every_6_hours", "daily", "weekly", "cron"]).optional(),
        intervalHours: z.number().int().min(1).max(168).optional(),
        cronExpression: z.string().optional()
      })
      .parse(request.body);

    const currentRes = await app.pg.query("select id, schedule_type, cron_expression from schedules where id = $1", [scheduleId]);
    if ((currentRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "周期任务不存在" });
    }

    const scheduleType = body.scheduleType ?? currentRes.rows[0].schedule_type;
    const cronExpression =
      scheduleType === "interval_hours"
        ? String(parseIntervalHours(body.intervalHours ?? body.cronExpression ?? currentRes.rows[0].cron_expression))
        : scheduleType === "cron"
          ? body.cronExpression ?? currentRes.rows[0].cron_expression ?? "0 * * * *"
          : null;

    await app.pg.query(
      `update schedules
       set enabled = coalesce($1, enabled),
           schedule_type = $2,
           cron_expression = $3,
           next_run_at = $4,
           updated_at = now()
       where id = $5`,
      [body.enabled ?? null, scheduleType, cronExpression, computeNextRunAt(scheduleType, cronExpression), scheduleId]
    );

    return { message: "周期任务已更新" };
  });

  app.post("/admin/schedules/:scheduleId/pause", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { scheduleId } = z.object({ scheduleId: z.string().uuid() }).parse(request.params);
    await app.pg.query("update schedules set paused = true, updated_at = now() where id = $1", [scheduleId]);
    return { message: "周期任务已暂停" };
  });

  app.post("/admin/schedules/:scheduleId/resume", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { scheduleId } = z.object({ scheduleId: z.string().uuid() }).parse(request.params);

    const currentRes = await app.pg.query("select schedule_type, cron_expression from schedules where id = $1", [scheduleId]);
    if ((currentRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "周期任务不存在" });
    }

    const row = currentRes.rows[0];
    const nextRunAt = computeNextRunAt(row.schedule_type, row.cron_expression);

    await app.pg.query(
      `update schedules
       set paused = false, enabled = true, next_run_at = $1, updated_at = now()
       where id = $2`,
      [nextRunAt, scheduleId]
    );

    return { message: "周期任务已恢复" };
  });

  app.post("/admin/sources/:sourceId/disable", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { sourceId } = z.object({ sourceId: z.string().uuid() }).parse(request.params);

    const sourceRes = await app.pg.query("select id, enabled from connector_sources where id = $1", [sourceId]);
    if ((sourceRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "Source 不存在" });
    }
    if (!sourceRes.rows[0].enabled) {
      return { message: "Source 已经是禁用状态" };
    }

    const activeJobRes = await app.pg.query(
      `select id, status
       from import_jobs
       where source_id = $1
         and status in ('queued', 'running', 'waiting_for_input', 'waiting_for_auth')
       order by created_at desc
       limit 1`,
      [sourceId]
    );
    if ((activeJobRes.rowCount ?? 0) > 0) {
      const activeJob = activeJobRes.rows[0];
      return reply.status(409).send({ message: `Source 正在运行任务 ${activeJob.id}（${activeJob.status}），不能禁用` });
    }

    await app.pg.query("update connector_sources set enabled = false, updated_at = now() where id = $1", [sourceId]);
    return { message: "Source 已禁用" };
  });

  app.delete("/admin/sources/:sourceId", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { sourceId } = z.object({ sourceId: z.string().uuid() }).parse(request.params);
    const sourceRes = await app.pg.query("select id from connector_sources where id = $1", [sourceId]);

    if ((sourceRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "Source 不存在" });
    }

    const activeJobRes = await app.pg.query(
      `select id, status
       from import_jobs
       where source_id = $1
         and status in ('queued', 'running', 'waiting_for_input', 'waiting_for_auth')
       order by created_at desc
       limit 1`,
      [sourceId]
    );
    if ((activeJobRes.rowCount ?? 0) > 0) {
      const activeJob = activeJobRes.rows[0];
      return reply.status(409).send({ message: `Source 正在被任务 ${activeJob.id} 使用（${activeJob.status}），不能删除` });
    }

    const mediaRes = await app.pg.query(
      `select m.storage_key
       from media_assets m
       join episodes e on e.id = m.episode_id
       join programs p on p.id = e.program_id
       where p.source_id = $1 and m.storage_provider = 'local'`,
      [sourceId]
    );
    const programCountRes = await app.pg.query("select count(*)::int as program_count from programs where source_id = $1", [sourceId]);
    const mediaKeys = mediaRes.rows.map((row) => String(row.storage_key));
    const programCount = Number(programCountRes.rows[0]?.program_count ?? 0);

    await app.pg.query("begin");
    try {
      await app.pg.query("delete from programs where source_id = $1", [sourceId]);
      await app.pg.query("delete from connector_sources where id = $1", [sourceId]);
      await app.pg.query("commit");
    } catch (error) {
      await app.pg.query("rollback");
      throw error;
    }

    const fileSummary = await deleteLocalMediaFiles(mediaKeys);
    if (fileSummary.failed > 0) {
      app.log.warn({ sourceId, failed: fileSummary.failed }, "failed to delete some source media files");
    }

    return {
      message: "Source 已删除",
      deletedPrograms: programCount,
      deletedMediaFiles: fileSummary.deleted,
      failedMediaFiles: fileSummary.failed
    };
  });
}
