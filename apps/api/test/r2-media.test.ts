import { describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";
process.env.JWT_EMAIL_SECRET ??= "test-email-secret-that-is-long-enough";
process.env.R2_PUBLIC_BASE_URL = "https://example.r2.dev/";
const { r2PublicUrl } = await import("../src/utils/media-storage.js");
const { applyRunnerEvents } = await import("../src/services/import-processing.js");
const key = `audio/${"a".repeat(64)}/${"b".repeat(64)}.mp3`;

describe("R2 media integration", () => {
  it("builds a permanent public enclosure URL and rejects arbitrary URLs", () => {
    expect(r2PublicUrl(key)).toBe(`https://example.r2.dev/${key}`);
    expect(() => r2PublicUrl("https://attacker.example/file.mp3")).toThrow();
    expect(() => r2PublicUrl("../secret")).toThrow();
  });
  it("records R2 storage metadata without treating it as a local path", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("select e.id")
      ? { rows: [{ id: "episode-1" }], rowCount: 1 } : { rows: [], rowCount: 1 });
    const app = { pg: { query }, log: { warn: vi.fn() } } as any;
    const summary = await applyRunnerEvents(app, "job-1", "source-1", [{ type: "media_ready",
      external_episode_id: "existing-id", file: key, storage_provider: "r2", storage_bucket: "podcastradio",
      original_filename: "episode.mp3", size: 123, checksum: "b".repeat(64) }]);
    expect(summary.media).toBe(1);
    const insertion = query.mock.calls.find(([sql]) => sql.includes("insert into media_assets"));
    expect(insertion).toBeDefined();
    expect((insertion as unknown as [string, unknown[]])[1]).toEqual(
      ["episode-1", key, "episode.mp3", "audio/mpeg", 123, "b".repeat(64), null, "r2", "podcastradio"]);
  });
  it("does not publish unverified R2 paths", async () => {
    const query = vi.fn(async () => ({ rows: [{ id: "episode-1" }], rowCount: 1 }));
    const summary = await applyRunnerEvents({ pg: { query } } as any, "job-1", "source-1",
      [{ type: "media_ready", external_episode_id: "x", file: "../missing", storage_provider: "r2", storage_bucket: "podcastradio" }]);
    expect(summary.media).toBe(0);
    expect(summary.failed).toBe(1);
  });
});
