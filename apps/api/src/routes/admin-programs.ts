import { FastifyInstance } from "fastify";
import { z } from "zod";
import { writeAdminAuditLog } from "../services/admin-audit.js";

function assertAdmin(request: { user: { id: string; isAdmin: boolean } | null }, reply: any): request is { user: { id: string; isAdmin: boolean } } {
  if (!request.user || !request.user.isAdmin) {
    reply.status(401).send({ message: "未登录管理员" });
    return false;
  }
  return true;
}

export async function adminProgramRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/programs/:programId/visibility", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { programId } = z.object({ programId: z.string().uuid() }).parse(request.params);

    const programRes = await app.pg.query("select id, visibility_mode from programs where id = $1", [programId]);
    if ((programRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "节目不存在" });
    }

    const groupRes = await app.pg.query(
      `select pag.audience_group_id, ag.name
       from program_audience_groups pag
       join audience_groups ag on ag.id = pag.audience_group_id
       where pag.program_id = $1
       order by ag.name asc`,
      [programId]
    );

    const userRes = await app.pg.query(
      `select pug.user_id, u.email
       from program_user_grants pug
       join users u on u.id = pug.user_id
       where pug.program_id = $1
       order by u.email asc`,
      [programId]
    );

    return {
      programId,
      visibilityMode: programRes.rows[0].visibility_mode,
      audienceGroups: groupRes.rows.map((row) => ({ id: row.audience_group_id, name: row.name })),
      users: userRes.rows.map((row) => ({ id: row.user_id, email: row.email }))
    };
  });

  app.get("/admin/programs", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const programs = await app.pg.query(
      `select p.id, p.title, p.description, p.cover_image_url, p.publish_status, p.visibility_mode,
              p.updated_at, count(distinct e.id) as episode_count,
              count(distinct m.id) as media_count
       from programs p
       left join episodes e on e.program_id = p.id
       left join media_assets m on m.episode_id = e.id and m.status = 'ready'
       group by p.id
       order by p.updated_at desc`
    );

    return {
      items: programs.rows.map((row) => ({
        id: row.id,
        title: row.title,
        description: row.description,
        coverImageUrl: row.cover_image_url,
        publishStatus: row.publish_status,
        visibilityMode: row.visibility_mode,
        episodeCount: Number(row.episode_count),
        mediaCount: Number(row.media_count),
        updatedAt: row.updated_at
      }))
    };
  });

  app.get("/admin/programs/:programId", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { programId } = z.object({ programId: z.string().uuid() }).parse(request.params);
    const program = await app.pg.query(
      `select p.id, p.title, p.description, p.cover_image_url, p.publish_status, p.visibility_mode, p.updated_at
       from programs p where p.id = $1`,
      [programId]
    );

    if ((program.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "节目不存在" });
    }

    const episodes = await app.pg.query(
      `select e.id, e.title, e.published_at, e.is_hidden, e.is_published,
              m.status as media_status, m.size_bytes
       from episodes e
       left join media_assets m on m.episode_id = e.id
       where e.program_id = $1
       order by e.published_at desc`,
      [programId]
    );

    return {
      ...program.rows[0],
      episodes: episodes.rows
    };
  });

  app.patch("/admin/programs/:programId", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { programId } = z.object({ programId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        title: z.string().min(1).optional(),
        description: z.string().optional(),
        publishStatus: z.enum(["draft", "published", "archived"]).optional(),
        visibilityMode: z.enum(["closed", "all_registered_users", "audience_groups", "specific_users"]).optional()
      })
      .parse(request.body);

    const current = await app.pg.query("select id from programs where id = $1", [programId]);
    if ((current.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "节目不存在" });
    }

    await app.pg.query(
      `update programs
       set title = coalesce($1, title),
           description = coalesce($2, description),
           publish_status = coalesce($3, publish_status),
           visibility_mode = coalesce($4, visibility_mode),
           updated_at = now()
       where id = $5`,
      [body.title ?? null, body.description ?? null, body.publishStatus ?? null, body.visibilityMode ?? null, programId]
    );

    if (body.visibilityMode === "closed" || body.visibilityMode === "all_registered_users") {
      await app.pg.query("delete from program_audience_groups where program_id = $1", [programId]);
      await app.pg.query("delete from program_user_grants where program_id = $1", [programId]);
    }

    await writeAdminAuditLog(app, request.user.id, "program.updated", "program", programId, {
      title: body.title ?? null,
      publishStatus: body.publishStatus ?? null,
      visibilityMode: body.visibilityMode ?? null
    });

    return { message: "节目已更新" };
  });

  app.post("/admin/programs/:programId/open", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { programId } = z.object({ programId: z.string().uuid() }).parse(request.params);
    await app.pg.query(
      `update programs
       set publish_status = 'published', visibility_mode = 'all_registered_users', updated_at = now()
       where id = $1`,
      [programId]
    );

    await app.pg.query("delete from program_audience_groups where program_id = $1", [programId]);
    await app.pg.query("delete from program_user_grants where program_id = $1", [programId]);
    await writeAdminAuditLog(app, request.user.id, "program.opened", "program", programId, {});

    return { message: "节目已开放" };
  });

  app.post("/admin/programs/:programId/close", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { programId } = z.object({ programId: z.string().uuid() }).parse(request.params);
    await app.pg.query(
      `update programs
       set visibility_mode = 'closed', updated_at = now()
       where id = $1`,
      [programId]
    );

    await app.pg.query("delete from program_audience_groups where program_id = $1", [programId]);
    await app.pg.query("delete from program_user_grants where program_id = $1", [programId]);
    await writeAdminAuditLog(app, request.user.id, "program.closed", "program", programId, {});

    return { message: "节目已关闭" };
  });

  app.post("/admin/programs/:programId/visibility", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { programId } = z.object({ programId: z.string().uuid() }).parse(request.params);
    const body = z
      .object({
        visibilityMode: z.enum(["closed", "all_registered_users", "audience_groups", "specific_users"]),
        audienceGroupIds: z.array(z.string().uuid()).optional(),
        userIds: z.array(z.string().uuid()).optional()
      })
      .parse(request.body);

    const exists = await app.pg.query("select id from programs where id = $1", [programId]);
    if ((exists.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "节目不存在" });
    }

    const audienceGroupIds = Array.from(new Set(body.audienceGroupIds ?? []));
    const userIds = Array.from(new Set(body.userIds ?? []));

    if (body.visibilityMode === "audience_groups") {
      if (audienceGroupIds.length === 0) {
        return reply.status(400).send({ message: "audience_groups 模式需要至少一个用户类别" });
      }

      const groupsRes = await app.pg.query("select id from audience_groups where id = any($1::uuid[])", [audienceGroupIds]);
      if ((groupsRes.rowCount ?? 0) !== audienceGroupIds.length) {
        return reply.status(400).send({ message: "存在无效的用户类别 ID" });
      }
    }

    if (body.visibilityMode === "specific_users") {
      if (userIds.length === 0) {
        return reply.status(400).send({ message: "specific_users 模式需要至少一个用户" });
      }

      const usersRes = await app.pg.query("select id from users where id = any($1::uuid[])", [userIds]);
      if ((usersRes.rowCount ?? 0) !== userIds.length) {
        return reply.status(400).send({ message: "存在无效的用户 ID" });
      }
    }

    await app.pg.query("begin");
    try {
      await app.pg.query("update programs set visibility_mode = $1, updated_at = now() where id = $2", [body.visibilityMode, programId]);
      await app.pg.query("delete from program_audience_groups where program_id = $1", [programId]);
      await app.pg.query("delete from program_user_grants where program_id = $1", [programId]);

      if (body.visibilityMode === "audience_groups") {
        for (const groupId of audienceGroupIds) {
          await app.pg.query(
            `insert into program_audience_groups (program_id, audience_group_id, created_at)
             values ($1, $2, now())`,
            [programId, groupId]
          );
        }
      }

      if (body.visibilityMode === "specific_users") {
        for (const userId of userIds) {
          await app.pg.query(
            `insert into program_user_grants (program_id, user_id, created_at)
             values ($1, $2, now())`,
            [programId, userId]
          );
        }
      }

      await app.pg.query("commit");
    } catch (error) {
      await app.pg.query("rollback");
      throw error;
    }

    await writeAdminAuditLog(app, request.user.id, "program.visibility_updated", "program", programId, {
      visibilityMode: body.visibilityMode,
      audienceGroupIds,
      userIds
    });

    return { message: "可见范围已更新" };
  });
}
