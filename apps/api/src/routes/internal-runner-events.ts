import { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../config.js";
import { applyAuthUpdateEvent } from "../services/import-processing.js";

const payloadSchema = z.object({
  eventType: z.string().min(1).max(64),
  level: z.string().max(16).nullable().optional(),
  message: z.string().max(20000).nullable().optional(),
  payload: z.record(z.any()).optional()
});

function normalizeRunnerEvent(body: z.infer<typeof payloadSchema>) {
  const payload = body.payload ?? {};
  if ((body.eventType !== "runner_stdout" && body.eventType !== "runner_stderr") || !body.message) {
    return { ...body, payload };
  }

  try {
    const parsed = JSON.parse(body.message) as { type?: unknown; level?: unknown; message?: unknown };
    if (typeof parsed.message === "string") {
      if (parsed.type === "auth_update") {
        return {
          eventType: "auth_update",
          level: typeof parsed.level === "string" ? parsed.level : body.level,
          message: parsed.message,
          payload: {
            ...payload,
            ...parsed,
            value: "[redacted]",
            secret_value: "[redacted]"
          },
          sensitiveEvent: parsed
        };
      }

      if (parsed.type === "qr_image") {
        return {
          eventType: "qr_image",
          level: typeof parsed.level === "string" ? parsed.level : body.level,
          message: parsed.message,
          payload: {
            ...payload,
            ...parsed
          }
        };
      }

      return {
        ...body,
        level: typeof parsed.level === "string" ? parsed.level : body.level,
        message: parsed.message,
        payload: {
          ...payload,
          connectorEvent: parsed
        }
      };
    }
  } catch {
    // Plain stdout/stderr should be stored as-is.
  }

  return { ...body, payload };
}

export async function internalRunnerEventRoutes(app: FastifyInstance): Promise<void> {
  app.post("/internal/runner/jobs/:jobId/events", async (request, reply) => {
    const token = request.headers["x-runner-token"];
    if (token !== env.RUNNER_INTERNAL_TOKEN) {
      return reply.status(401).send({ message: "invalid runner token" });
    }

    const { jobId } = z.object({ jobId: z.string().uuid() }).parse(request.params);
    const body = normalizeRunnerEvent(payloadSchema.parse(request.body)) as ReturnType<typeof normalizeRunnerEvent> & {
      sensitiveEvent?: Record<string, unknown>;
    };

    const jobRes = await app.pg.query("select id, source_id from import_jobs where id = $1", [jobId]);
    if ((jobRes.rowCount ?? 0) === 0) {
      return reply.status(404).send({ message: "job not found" });
    }

    await app.pg.query(
      `insert into import_job_events (id, job_id, event_type, level, message, payload_json, created_at)
       values (gen_random_uuid(), $1, $2, $3, $4, $5::jsonb, now())`,
      [jobId, body.eventType, body.level ?? null, body.message ?? null, JSON.stringify(body.payload)]
    );
    await app.pg.query(
      "update import_jobs set updated_at = now() where id = $1 and status = 'running'",
      [jobId]
    );

    if (body.eventType === "auth_update" && body.sensitiveEvent) {
      await applyAuthUpdateEvent(app, jobRes.rows[0].source_id, body.sensitiveEvent);
    }

    return { ok: true };
  });
}
