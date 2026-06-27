import { FastifyInstance } from "fastify";
import { z } from "zod";
import { encryptSecret } from "../utils/secrets.js";

function assertAdmin(request: { user: { id: string; isAdmin: boolean } | null }, reply: any): request is { user: { id: string; isAdmin: boolean } } {
  if (!request.user || !request.user.isAdmin) {
    reply.status(401).send({ message: "未登录管理员" });
    return false;
  }
  return true;
}

type ManifestLike = {
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

export async function adminSourceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/sources", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const rows = await app.pg.query(
      `select s.id, s.name, s.enabled, s.auth_status, s.auth_unattended_ready, s.run_policy,
              s.last_success_sync_at, s.last_job_status, s.created_at, s.updated_at,
              c.id as connector_id, c.name as connector_name, c.display_name as connector_display_name,
              cv.id as connector_version_id, cv.version as connector_version
       from connector_sources s
       join connectors c on c.id = s.connector_id
       join connector_versions cv on cv.id = s.connector_version_id
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
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        connector: {
          id: row.connector_id,
          name: row.connector_name,
          displayName: row.connector_display_name,
          versionId: row.connector_version_id,
          version: row.connector_version
        }
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

    const authConfigured = Object.keys(normalized.secrets).length > 0;
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
              csc.config_json
       from connector_sources s
       join connectors c on c.id = s.connector_id
       join connector_versions cv on cv.id = s.connector_version_id
       left join connector_source_configs csc on csc.source_id = s.id
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
      updatedAt: source.updated_at,
      connector: {
        id: source.connector_id,
        name: source.connector_name,
        displayName: source.connector_display_name,
        versionId: source.connector_version_id,
        version: source.connector_version
      },
      manifest: source.manifest_json,
      inputConfig: source.config_json ?? {},
      secretStatus: secretRes.rows.map((row) => ({
        key: row.secret_key,
        status: row.status,
        updatedAt: row.updated_at
      }))
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
    await app.pg.query("update connector_sources set enabled = true, updated_at = now() where id = $1", [sourceId]);
    return { message: "Source 已启用" };
  });

  app.post("/admin/sources/:sourceId/disable", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { sourceId } = z.object({ sourceId: z.string().uuid() }).parse(request.params);
    await app.pg.query("update connector_sources set enabled = false, updated_at = now() where id = $1", [sourceId]);
    return { message: "Source 已禁用" };
  });
}
