import { FastifyInstance } from "fastify";

export async function writeAdminAuditLog(
  app: FastifyInstance,
  actorUserId: string,
  action: string,
  targetType: string,
  targetId: string,
  detail: Record<string, unknown>
): Promise<void> {
  await app.pg.query(
    `insert into admin_audit_logs (id, actor_user_id, action, target_type, target_id, detail_json, created_at)
     values (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, now())`,
    [actorUserId, action, targetType, targetId, JSON.stringify(detail)]
  );
}
