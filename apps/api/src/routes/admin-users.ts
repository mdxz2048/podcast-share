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

export async function adminUserRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/users", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const usersRes = await app.pg.query(
      `select u.id, u.email, u.email_verified_at, u.status, u.created_at, u.updated_at,
              coalesce(array_agg(ag.name order by ag.name) filter (where ag.name is not null), '{}') as audience_groups
       from users u
       left join user_audience_groups uag on uag.user_id = u.id
       left join audience_groups ag on ag.id = uag.audience_group_id
       group by u.id
       order by u.updated_at desc
       limit 300`
    );

    return {
      items: usersRes.rows.map((row) => ({
        id: row.id,
        email: row.email,
        emailVerified: Boolean(row.email_verified_at),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        audienceGroups: row.audience_groups as string[]
      }))
    };
  });

  app.post("/admin/users/:userId/audience-groups/:groupId", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { userId, groupId } = z.object({ userId: z.string().uuid(), groupId: z.string().uuid() }).parse(request.params);

    const exists = await app.pg.query("select id from users where id = $1", [userId]);
    if ((exists.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "用户不存在" });
    }

    const groupRes = await app.pg.query("select id from audience_groups where id = $1", [groupId]);
    if ((groupRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "用户类别不存在" });
    }

    await app.pg.query(
      `insert into user_audience_groups (user_id, audience_group_id, created_at)
       values ($1, $2, now())
       on conflict do nothing`,
      [userId, groupId]
    );

    await writeAdminAuditLog(app, request.user.id, "user.group_attached", "user", userId, {
      groupId
    });

    return { message: "用户已加入类别" };
  });

  app.delete("/admin/users/:userId/audience-groups/:groupId", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const { userId, groupId } = z.object({ userId: z.string().uuid(), groupId: z.string().uuid() }).parse(request.params);

    await app.pg.query("delete from user_audience_groups where user_id = $1 and audience_group_id = $2", [userId, groupId]);

    await writeAdminAuditLog(app, request.user.id, "user.group_detached", "user", userId, {
      groupId
    });

    return { message: "用户已移出类别" };
  });
}
