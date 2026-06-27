export type FeedItem = {
  episodeId: string;
  title: string;
  description: string | null;
  publishedAt: string;
  audioUrl: string;
  mediaLength: number;
  mediaType: string;
  programTitle: string;
};

export function xmlEscape(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function buildRssXml(feedName: string, feedUrl: string, items: FeedItem[]): string {
  const sorted = [...items].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const itemXml = sorted
    .map(
      (item) => `<item>
<title>${xmlEscape(item.title)}</title>
<description>${xmlEscape(item.description ?? "")}</description>
<pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>
<guid isPermaLink="false">${item.episodeId}</guid>
<enclosure url="${xmlEscape(item.audioUrl)}" length="${item.mediaLength}" type="${xmlEscape(item.mediaType)}" />
<author>${xmlEscape(item.programTitle)}</author>
</item>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>${xmlEscape(feedName)}</title>
<link>${xmlEscape(feedUrl)}</link>
<description>Podcast Hub 私有订阅</description>
${itemXml}
</channel>
</rss>`;
}

export function parseRange(rangeHeader: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return null;
  }

  const startRaw = match[1];
  const endRaw = match[2];

  const start = startRaw ? Number(startRaw) : 0;
  const end = endRaw ? Number(endRaw) : size - 1;

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= size) {
    return null;
  }

  return { start, end };
}
