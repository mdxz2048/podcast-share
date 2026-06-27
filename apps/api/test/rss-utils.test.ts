import { describe, expect, it } from "vitest";
import { buildRssXml, parseRange, xmlEscape } from "../src/utils/rss.js";

describe("rss helpers", () => {
  it("sorts items by published time desc", () => {
    const xml = buildRssXml("测试订阅", "http://localhost/feed.xml", [
      {
        episodeId: "ep-1",
        title: "早期",
        description: "d1",
        publishedAt: "2026-01-01T00:00:00Z",
        audioUrl: "http://localhost/a.mp3",
        mediaLength: 1,
        mediaType: "audio/mpeg",
        programTitle: "节目A"
      },
      {
        episodeId: "ep-2",
        title: "后期",
        description: "d2",
        publishedAt: "2026-01-02T00:00:00Z",
        audioUrl: "http://localhost/b.mp3",
        mediaLength: 2,
        mediaType: "audio/mpeg",
        programTitle: "节目B"
      }
    ]);

    expect(xml.indexOf("后期")).toBeLessThan(xml.indexOf("早期"));
  });

  it("escapes xml characters", () => {
    const escaped = xmlEscape("a<b&c>");
    expect(escaped).toBe("a&lt;b&amp;c&gt;");
  });

  it("parses byte range", () => {
    expect(parseRange("bytes=10-20", 100)).toEqual({ start: 10, end: 20 });
    expect(parseRange("bytes=10-", 100)).toEqual({ start: 10, end: 99 });
    expect(parseRange("bytes=120-130", 100)).toBeNull();
  });
});
