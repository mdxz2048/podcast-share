export type FeedItem = {
  episodeId: string;
  title: string;
  description: string | null;
  publishedAt: string;
  audioUrl: string;
  mediaLength: number;
  mediaType: string;
  programTitle: string;
  programImageUrl?: string | null;
  durationSeconds?: number | null;
};

export type RssTemplate = {
  description: string;
  siteUrl: string;
  contact?: string;
  notice?: string;
};

export function xmlEscape(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) {
    return null;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function buildRssXml(feedName: string, feedUrl: string, items: FeedItem[], template?: Partial<RssTemplate>): string {
  const sorted = [...items].sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  const channelImageUrl = sorted.find((item) => item.programImageUrl)?.programImageUrl?.trim() || "";
  const itemXml = sorted
    .map((item) => {
      const duration = formatDuration(item.durationSeconds);
      const imageUrl = item.programImageUrl?.trim() || "";
      return `<item>
<title>${xmlEscape(`[${item.programTitle}]${item.title}`)}</title>
<description>${xmlEscape(item.description ?? "")}</description>
<pubDate>${new Date(item.publishedAt).toUTCString()}</pubDate>
<guid isPermaLink="false">${item.episodeId}</guid>
<enclosure url="${xmlEscape(item.audioUrl)}" length="${item.mediaLength}" type="${xmlEscape(item.mediaType)}" />
<author>${xmlEscape(item.programTitle)}</author>
${imageUrl ? `<itunes:image href="${xmlEscape(imageUrl)}" />` : ""}
${duration ? `<itunes:duration>${xmlEscape(duration)}</itunes:duration>` : ""}
</item>`
    })
    .join("\n");

  const channelTitle = feedName;
  const descriptionParts = [
    template?.description?.trim() || "Podcast Hub 私有订阅",
    template?.siteUrl?.trim() ? `网站：${template.siteUrl.trim()}` : "",
    template?.contact?.trim() ? `联系：${template.contact.trim()}` : "",
    template?.notice?.trim()
  ].filter(Boolean);
  const channelLink = template?.siteUrl?.trim() || feedUrl;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
<title>${xmlEscape(channelTitle)}</title>
<link>${xmlEscape(channelLink)}</link>
<description>${xmlEscape(descriptionParts.join("\n\n"))}</description>
${channelImageUrl ? `<image><url>${xmlEscape(channelImageUrl)}</url><title>${xmlEscape(channelTitle)}</title><link>${xmlEscape(channelLink)}</link></image>` : ""}
${channelImageUrl ? `<itunes:image href="${xmlEscape(channelImageUrl)}" />` : ""}
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
