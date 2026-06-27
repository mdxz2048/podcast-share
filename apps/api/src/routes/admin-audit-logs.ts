import { FastifyInstance } from "fastify";
import { z } from "zod";

function assertAdmin(request: { user: { isAdmin: boolean } | null }, reply: any): boolean {
  if (!request.user || !request.user.isAdmin) {
    reply.status(401).send({ message: "未登录管理员" });
    return false;
  }
  return true;
}

export async function adminAuditLogRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/audit-logs", async (request, reply) => {
    if (!assertAdmin(request, reply)) {
      return;
    }

    const query = z
      .object({
        limit: z.coerce.number().int().min(1).max(200).default(50)
      })
      .parse(request.query);

    const res = await app.pg.query(
      `select l.id, l.actor_user_id, l.action, l.target_type, l.target_id, l.detail_json, l.created_at,
              u.email as actor_email
       from admin_audit_logs l
       join users u on u.id = l.actor_user_id
       order by l.created_at desc
       limit $1`,
      [query.limit]
    );

    return {
      items: res.rows.map((row) => ({
        id: row.id,
        actorUserId: row.actor_user_id,
        actorEmail: row.actor_email,
        action: row.action,
        targetType: row.target_type,
        targetId: row.target_id,
        detail: row.detail_json,
        createdAt: row.created_at
      }))
    };
  });
}
