import type { RawSourceItem } from "./types";
import { RSS_FEEDS, type RssFeed } from "./catalog";
import { researchFetch } from "./fetch";

function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(xml: string, name: string): string | null {
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i");
  const m = xml.match(re);
  return m?.[1] ? decodeXml(m[1]) : null;
}

function linkFromItem(item: string): string | null {
  const atom = item.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1];
  if (atom) return atom;
  const rss = tag(item, "link");
  if (rss?.startsWith("http")) return rss;
  const guid = tag(item, "guid");
  if (guid?.startsWith("http")) return guid;
  return null;
}

function parseFeedXml(xml: string, feed: RssFeed, limit: number): RawSourceItem[] {
  const chunks = xml.split(/<item[\s>]/i).slice(1);
  const entries =
    chunks.length > 0 ? chunks : xml.split(/<entry[\s>]/i).slice(1);

  const out: RawSourceItem[] = [];
  for (const chunk of entries.slice(0, limit)) {
    const title = tag(chunk, "title");
    const url = linkFromItem(chunk);
    if (!title || !url) continue;
    const summary =
      tag(chunk, "description") ||
      tag(chunk, "summary") ||
      tag(chunk, "content") ||
      undefined;
    const externalId = `${feed.name}:${url}`.slice(0, 180);
    // Tech news deprioritized vs primary sources
    const baseScore = feed.priority * 12 + (feed.category === "tech_news" ? -8 : 0);
    out.push({
      provider: "rss",
      externalId,
      title: `[${feed.name}] ${title}`,
      url,
      summary: summary?.slice(0, 500),
      score: baseScore,
      priority: feed.priority,
      raw: { feed: feed.name, category: feed.category },
    });
  }
  return out;
}

async function fetchOneFeed(feed: RssFeed, limit: number): Promise<RawSourceItem[]> {
  try {
    const res = await researchFetch(feed.url, {
      headers: {
        "User-Agent": "DevPulse-AI/1.0 (research RSS reader)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      timeoutMs: 12_000,
    });
    if (!res.ok) return [];
    // Cap body size — huge atom feeds (multi‑MB) are truncated for parsing
    const buf = await res.arrayBuffer();
    const maxBytes = 1_500_000; // under Next 2MB data-cache limit; we use no-store anyway
    const slice = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
    const xml = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    return parseFeedXml(xml, feed, limit);
  } catch {
    return [];
  }
}

/**
 * Pull RSS/Atom from AI company blogs, engineering blogs, and (lightly) tech news.
 * No API keys required.
 */
export async function fetchRssFeeds(perFeed = 4): Promise<RawSourceItem[]> {
  // Cap concurrent fetches to avoid stampeding remote hosts
  const batchSize = 6;
  const results: RawSourceItem[] = [];

  for (let i = 0; i < RSS_FEEDS.length; i += batchSize) {
    const batch = RSS_FEEDS.slice(i, i + batchSize);
    const settled = await Promise.all(batch.map((f) => fetchOneFeed(f, perFeed)));
    for (const items of settled) results.push(...items);
  }

  return results;
}
