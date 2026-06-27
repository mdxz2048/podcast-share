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

export async function adminAudienceGroupRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/audience-groups", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const res = await app.pg.query(
      `select ag.id, ag.name, ag.created_at, ag.updated_at,
              count(uag.user_id) as member_count
       from audience_groups ag
       left join user_audience_groups uag on uag.audience_group_id = ag.id
       group by ag.id
       order by ag.updated_at desc`
    );

    return {
      items: res.rows.map((row) => ({
        id: row.id,
        name: row.name,
        memberCount: Number(row.member_count),
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }))
    };
  });

  app.post("/admin/audience-groups", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const body = z.object({ name: z.string().min(1).max(80) }).parse(request.body);

    const inserted = await app.pg.query(
      `insert into audience_groups (id, name, created_at, updated_at)
       values (gen_random_uuid(), $1, now(), now())
       returning id, name, created_at, updated_at`,
      [body.name.trim()]
    );

    const row = inserted.rows[0];
    await writeAdminAuditLog(app, request.user.id, "audience_group.created", "audience_group", row.id, {
      name: row.name
    });

    return reply.status(201).send({
      id: row.id,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  });

  app.patch("/admin/audience-groups/:groupId", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { groupId } = z.object({ groupId: z.string().uuid() }).parse(request.params);
    const body = z.object({ name: z.string().min(1).max(80) }).parse(request.body);

    const updated = await app.pg.query(
      `update audience_groups
       set name = $1, updated_at = now()
       where id = $2
       returning id, name, updated_at`,
      [body.name.trim(), groupId]
    );

    if ((updated.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "用户类别不存在" });
    }

    await writeAdminAuditLog(app, request.user.id, "audience_group.renamed", "audience_group", groupId, {
      name: updated.rows[0].name
    });

    return { message: "用户类别已更新" };
  });

  app.delete("/admin/audience-groups/:groupId", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { groupId } = z.object({ groupId: z.string().uuid() }).parse(request.params);

    const deleted = await app.pg.query("delete from audience_groups where id = $1", [groupId]);
    if ((deleted.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "用户类别不存在" });
    }

    await writeAdminAuditLog(app, request.user.id, "audience_group.deleted", "audience_group", groupId, {});
    return { message: "用户类别已删除" };
  });

  app.get("/admin/audience-groups/:groupId/users", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { groupId } = z.object({ groupId: z.string().uuid() }).parse(request.params);

    const groupRes = await app.pg.query("select id, name from audience_groups where id = $1", [groupId]);
    if ((groupRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "用户类别不存在" });
    }

    const usersRes = await app.pg.query(
      `select u.id, u.email, u.email_verified_at, u.status, u.updated_at
       from user_audience_groups uag
       join users u on u.id = uag.user_id
       where uag.audience_group_id = $1
       order by u.updated_at desc`,
      [groupId]
    );

    return {
      group: groupRes.rows[0],
      items: usersRes.rows.map((row) => ({
        id: row.id,
        email: row.email,
        emailVerified: Boolean(row.email_verified_at),
        status: row.status,
        updatedAt: row.updated_at
      }))
    };
  });
}
