import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import { validateAuthEvent } from "../src/utils/auth-events.js";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";
process.env.JWT_EMAIL_SECRET ??= "test-email-secret-long-enough";
const { internalRunnerEventRoutes } = await import("../src/routes/internal-runner-events.js");
const { env } = await import("../src/config.js");

const challenge = {
  type: "auth_challenge", challenge_id: "qr-1", method: "qr",
  image_data_url: "data:image/png;base64," + "A".repeat(30_000),
  expires_at: "2030-01-01T00:00:00Z", message: "请扫码"
};

async function fixture(status = "running") {
  const app = Fastify();
  const query = vi.fn(async (sql: string) => {
    if (sql.startsWith("select id, source_id")) return { rowCount: 1, rows: [{ id: "job", source_id: "source", status }] };
    if (sql.includes("select cv.manifest_json")) return { rowCount: 1, rows: [{ manifest_json: { secrets: [{ key: "xet_cookie_jar" }] } }] };
    if (sql.includes("insert into secret_records")) return { rowCount: 1, rows: [{ id: "secret" }] };
    return { rowCount: 1, rows: [] };
  });
  app.decorate("pg", { query });
  await app.register(internalRunnerEventRoutes);
  return { app, query };
}

const url = "/internal/runner/jobs/00000000-0000-4000-8000-000000000001/events";
const headers = { "x-runner-token": env.RUNNER_INTERNAL_TOKEN };

describe("interactive authentication events", () => {
  it("accepts raster QR images and rejects remote images, SVG and oversized payloads", () => {
    expect(validateAuthEvent("auth_challenge", challenge)).toBe(true);
    for (const image of ["https://example.com/qr.png", "data:image/svg+xml;base64,AAAA", "data:image/png;base64," + "A".repeat(512_000)]) {
      expect(validateAuthEvent("auth_challenge", { ...challenge, image_data_url: image })).toBe(false);
    }
  });

  it("streams QR images larger than the terminal message limit without truncation", async () => {
    const { app, query } = await fixture();
    try {
      const response = await app.inject({ method: "POST", url, headers, payload: { eventType: "auth_challenge", message: "请扫码", payload: challenge } });
      expect(response.statusCode).toBe(200);
      const insert = query.mock.calls.find(([sql]) => sql.includes("insert into import_job_events")) as unknown as [string, unknown[]];
      expect(JSON.parse(insert[1][4] as string).image_data_url).toBe(challenge.image_data_url);
    } finally { await app.close(); }
  });

  it("persists session updates encrypted and redacts values from job logs", async () => {
    const { app, query } = await fixture();
    try {
      const response = await app.inject({ method: "POST", url, headers, payload: {
        eventType: "auth_update", payload: { secret_key: "xet_cookie_jar", value: "private-cookie-value" }
      } });
      expect(response.statusCode).toBe(200);
      const calls = query.mock.calls as unknown as Array<[string, unknown[]]>;
      const logged = calls.find(([sql]) => sql.includes("insert into import_job_events"))![1];
      expect(JSON.stringify(logged)).not.toContain("private-cookie-value");
      const stored = calls.find(([sql]) => sql.includes("insert into secret_records"))![1];
      expect(stored[1]).not.toBe("private-cookie-value");
    } finally { await app.close(); }
  });

  it("rejects unauthenticated callbacks and callbacks for cancelled jobs", async () => {
    const { app, query } = await fixture("cancelled");
    try {
      const payload = { eventType: "auth_challenge", payload: challenge };
      expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(401);
      expect((await app.inject({ method: "POST", url, headers, payload })).statusCode).toBe(409);
      expect(query.mock.calls.some(([sql]) => sql.includes("insert"))).toBe(false);
    } finally { await app.close(); }
  });
});
