import { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config.js";

const payloadSchema = z.object({
  eventType: z.string().min(1).max(64),
  level: z.string().max(16).nullable().optional(),
  message: z.string().max(20000).nullable().optional(),
  payload: z.record(z.any()).optional()
});

export async function internalRunnerEventRoutes(app: FastifyInstance): Promise<void> {
  app.post("/internal/runner/jobs/:jobId/events", async (request, reply) => {
    const token = request.headers["x-runner-token"];
    if (token !== env.RUNNER_INTERNAL_TOKEN) {
      return reply.status(401).send({ message: "invalid runner token" });
    }

    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(request.params);
    const body = payloadSchema.parse(request.body);

    const jobRes = await app.pg.query("select id from import_jobs where id = $1", [jobId]);
    if ((jobRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "job not found" });
    }

    await app.pg.query(
      `insert into import_job_events (id, job_id, event_type, level, message, payload_json, created_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, now())`,
      [jobId, body.eventType, body.level ?? null, body.message ?? null, JSON.stringify(body.payload ?? {})]
    );

    return { ok: true };
  });
}
