import { FastifyInstance } from "fastify";
import { executeSourceImport } from "../services/job-execution.js";

function parseIntervalHours(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 6;
  }
  return Math.min(168, Math.max(1, Math.trunc(parsed)));
}

function nextRunAt(scheduleType: string, cronExpression: string | null): Date {
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
    return new Date(now.getTime() + 60 * 60 * 1000);
  }
  return new Date(now.getTime() + 60 * 60 * 1000);
}

export async function internalScheduleRoutes(app: FastifyInstance): Promise<void> {
  app.post("/internal/schedules/tick", async () => {
    const dueRes = await app.pg.query(
      `select id, source_id, schedule_type, cron_expression
       from schedules
       where enabled = true
         and paused = false
         and next_run_at is not null
         and next_run_at <= now()
       order by next_run_at asc
       limit 20`
    );

    let triggered = 0;
    let failed = 0;

    for (const row of dueRes.rows) {
      try {
        const result = await executeSourceImport(app, {
          sourceId: row.source_id,
          triggerType: "scheduled",
          createdBy: null
        });

        await app.pg.query(
          `update schedules
           set last_run_at = now(),
               last_success_at = case when $1 = 'completed' then now() else last_success_at end,
               last_error_at = case when $1 = 'failed' then now() else last_error_at end,
               next_run_at = $2,
               updated_at = now()
           where id = $3`,
          [result.status, nextRunAt(row.schedule_type, row.cron_expression), row.id]
        );

        triggered += 1;
      } catch {
        await app.pg.query(
          `update schedules
           set last_run_at = now(),
               last_error_at = now(),
               next_run_at = $1,
               updated_at = now()
           where id = $2`,
          [nextRunAt(row.schedule_type, row.cron_expression), row.id]
        );

        failed += 1;
      }
    }

    return {
      checked: dueRes.rowCount ?? 0,
      triggered,
      failed
    };
  });
}
