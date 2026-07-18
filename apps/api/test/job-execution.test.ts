import { describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.JWT_EMAIL_SECRET ??= "test-email-secret-that-is-long-enough";

const { recoverStaleRunningJobs, resolveRunnerFinalStatus } = await import("../src/services/job-execution.js");

describe("stale import job recovery", () => {
  it("marks stale running jobs as timed out so source scheduling can continue", async () => {
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("where status = 'running'")) {
        return { rowCount: 1, rows: [{ id: "job-1", source_id: "source-1" }] };
      }
      if (sql === "select status from import_jobs where id = $1") {
        return { rowCount: 1, rows: [{ status: "running" }] };
      }
      if (sql.includes("where id = $9 and status = $10")) {
        return { rowCount: 1, rows: [] };
      }
      return { rowCount: 1, rows: [] };
    });

    describe("runner status finalization", () => {
      it("preserves a connector's waiting status", () => {
        expect(resolveRunnerFinalStatus("waiting_for_auth", [])).toBe("waiting_for_auth");
        expect(resolveRunnerFinalStatus("waiting_for_input", [])).toBe("waiting_for_input");
      });

      it("derives a waiting status from completed connector output", () => {
        expect(resolveRunnerFinalStatus("completed", [{ type: "auth_required" }])).toBe("waiting_for_auth");
      });
    });
    const app = { pg: { query } } as any;

    await expect(recoverStaleRunningJobs(app)).resolves.toBe(1);

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("where id = $9 and status = $10"),
      expect.arrayContaining(["timeout", "job-1", "running"])
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("update connector_sources"),
      ["timeout", "source-1"]
    );
  });
});
