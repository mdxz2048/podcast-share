import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { FastifyInstance } from "fastify";
import { z } from "zod";
import { validateConnectorZip } from "../utils/connector-validation.js";

function assertAdmin(request: { user: { id: string; isAdmin: boolean } | null }, reply: any): request is { user: { id: string; isAdmin: boolean } } {
  if (!request.user || !request.user.isAdmin) {
    reply.status(401).send({ message: "未登录管理员" });
    return false;
  }
  return true;
}

export async function adminConnectorRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/connectors", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const rows = await app.pg.query(
      `select c.id, c.name, c.display_name, c.status, c.updated_at,
              cv.id as latest_version_id, cv.version as latest_version
       from connectors c
       left join connector_versions cv on cv.id = c.latest_version_id
       order by c.updated_at desc`
    );

    return {
      items: rows.rows.map((row) => ({
        id: row.id,
        name: row.name,
        displayName: row.display_name,
        status: row.status,
        latestVersionId: row.latest_version_id,
        latestVersion: row.latest_version,
        updatedAt: row.updated_at
      }))
    };
  });

  app.post("/admin/connectors/upload", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const uploaded = await request.file();
    if (!uploaded) {
      return reply.status(400).send({ message: "请上传 ZIP 文件" });
    }

    if (!uploaded.filename.toLowerCase().endsWith(".zip")) {
      return reply.status(400).send({ message: "只支持 ZIP 文件" });
    }

    const buffer = await uploaded.toBuffer();

    let validated;
    try {
      validated = validateConnectorZip(buffer);
    } catch (error) {
      return reply.status(400).send({ message: error instanceof Error ? error.message : "ZIP 校验失败" });
    }

    const packageDir = resolve(process.cwd(), "storage/connectors/packages");
    await mkdir(packageDir, { recursive: true });

    const packageFileName = `${Date.now()}-${validated.manifest.name}-${validated.manifest.version}.zip`;
    const packagePath = resolve(packageDir, packageFileName);
    await writeFile(packagePath, buffer);

    const connectorRes = await app.pg.query(
      `insert into connectors (id, name, display_name, status, created_by, created_at, updated_at)
       values (gen_random_uuid(), $1, $2, 'pending_review', $3, now(), now())
       on conflict (name)
       do update set display_name = excluded.display_name, updated_at = now()
       returning id, name, display_name, status`,
      [validated.manifest.name, validated.manifest.display_name, request.user.id]
    );

    const connector = connectorRes.rows[0];

    const existsVersion = await app.pg.query(
      `select id from connector_versions
       where connector_id = $1 and version = $2`,
      [connector.id, validated.manifest.version]
    );

    if ((existsVersion.rowCount ?? 0) > 0) {
      return reply.status(409).send({ message: "该 Connector 版本已存在" });
    }

    const versionRes = await app.pg.query(
      `insert into connector_versions (
          id, connector_id, version, manifest_json, run_modes_json, authentication_json,
          inputs_json, secrets_json, package_path, package_sha256, status, uploaded_by, created_at
       )
       values (
          gen_random_uuid(), $1, $2, $3::jsonb, $4::jsonb, $5::jsonb,
          $6::jsonb, $7::jsonb, $8, $9, 'pending_review', $10, now()
       )
       returning id, version, status`,
      [
        connector.id,
        validated.manifest.version,
        JSON.stringify(validated.manifest),
        JSON.stringify(validated.manifest.run_modes),
        JSON.stringify(validated.manifest.authentication),
        JSON.stringify(validated.manifest.inputs ?? []),
        JSON.stringify(validated.manifest.secrets ?? []),
        packagePath,
        validated.checksum,
        request.user.id
      ]
    );

    const version = versionRes.rows[0];

    await app.pg.query("update connectors set latest_version_id = $1, updated_at = now() where id = $2", [version.id, connector.id]);

    await app.pg.query(
      `insert into connector_packages (
         id, connector_version_id, storage_provider, storage_key, size_bytes, checksum, created_at
       ) values (gen_random_uuid(), $1, 'local', $2, $3, $4, now())`,
      [version.id, packagePath, validated.sizeBytes, validated.checksum]
    );

    await app.pg.query(
      `insert into connector_events (id, connector_id, connector_version_id, event_type, summary, actor_user_id, created_at)
       values (gen_random_uuid(), $1, $2, 'uploaded', $3, $4, now())`,
      [connector.id, version.id, `uploaded ${validated.manifest.version}`, request.user.id]
    );

    return reply.status(201).send({
      connector: {
        id: connector.id,
        name: connector.name,
        displayName: connector.display_name,
        status: connector.status
      },
      version: {
        id: version.id,
        version: version.version,
        status: version.status
      },
      manifestSummary: {
        runModes: validated.manifest.run_modes,
        authentication: validated.manifest.authentication,
        inputs: validated.manifest.inputs,
        secrets: validated.manifest.secrets ?? []
      }
    });
  });

  app.get("/admin/connectors/:connectorId", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { connectorId } = z.object({ connectorId: z.string().uuid() }).parse(request.params);

    const connectorRes = await app.pg.query(
      `select id, name, display_name, status, created_at, updated_at, latest_version_id
       from connectors
       where id = $1`,
      [connectorId]
    );

    if ((connectorRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "Connector 不存在" });
    }

    const versionsRes = await app.pg.query(
      `select id, version, status, manifest_json, created_at
       from connector_versions
       where connector_id = $1
       order by created_at desc`,
      [connectorId]
    );

    const eventsRes = await app.pg.query(
      `select event_type, summary, created_at
       from connector_events
       where connector_id = $1
       order by created_at desc
       limit 20`,
      [connectorId]
    );

    const connector = connectorRes.rows[0];
    return {
      id: connector.id,
      name: connector.name,
      displayName: connector.display_name,
      status: connector.status,
      latestVersionId: connector.latest_version_id,
      versions: versionsRes.rows.map((row) => ({
        id: row.id,
        version: row.version,
        status: row.status,
        manifest: row.manifest_json,
        createdAt: row.created_at
      })),
      events: eventsRes.rows
    };
  });

  app.post("/admin/connectors/:connectorId/approve", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { connectorId } = z.object({ connectorId: z.string().uuid() }).parse(request.params);
    const body = z.object({ connectorVersionId: z.string().uuid().optional() }).parse(request.body ?? {});

    const targetVersionRes = body.connectorVersionId
      ? await app.pg.query(
          `select id from connector_versions where id = $1 and connector_id = $2`,
          [body.connectorVersionId, connectorId]
        )
      : await app.pg.query(
          `select id from connector_versions
           where connector_id = $1
           order by created_at desc
           limit 1`,
          [connectorId]
        );

    if ((targetVersionRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "Connector 版本不存在" });
    }

    const versionId = targetVersionRes.rows[0].id;

    await app.pg.query("update connector_versions set status = 'enabled' where id = $1", [versionId]);
    await app.pg.query(
      `update connectors
       set status = 'enabled', latest_version_id = $1, reviewed_at = now(), reviewed_by = $2, updated_at = now()
       where id = $3`,
      [versionId, request.user.id, connectorId]
    );

    await app.pg.query(
      `insert into connector_events (id, connector_id, connector_version_id, event_type, summary, actor_user_id, created_at)
       values (gen_random_uuid(), $1, $2, 'approved', 'connector approved', $3, now())`,
      [connectorId, versionId, request.user.id]
    );

    return { message: "Connector 已启用", connectorVersionId: versionId };
  });

  app.post("/admin/connectors/:connectorId/disable", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { connectorId } = z.object({ connectorId: z.string().uuid() }).parse(request.params);

    await app.pg.query("update connectors set status = 'disabled', updated_at = now() where id = $1", [connectorId]);
    await app.pg.query("update connector_versions set status = 'disabled' where connector_id = $1 and status = 'enabled'", [connectorId]);

    await app.pg.query(
      `insert into connector_events (id, connector_id, event_type, summary, actor_user_id, created_at)
       values (gen_random_uuid(), $1, 'disabled', 'connector disabled', $2, now())`,
      [connectorId, request.user.id]
    );

    return { message: "Connector 已禁用" };
  });

  app.delete("/admin/connectors/:connectorId", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { connectorId } = z.object({ connectorId: z.string().uuid() }).parse(request.params);

    const connectorRes = await app.pg.query("select id from connectors where id = $1", [connectorId]);
    if ((connectorRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "Connector 不存在" });
    }

    await app.pg.query("delete from connectors where id = $1", [connectorId]);
    return { message: "Connector 已删除" };
  });
}
