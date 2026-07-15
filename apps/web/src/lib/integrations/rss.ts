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

async function fetchOneFeed(
  feed: RssFeed,
  limit: number,
  timeoutMs: number,
): Promise<RawSourceItem[]> {
  try {
    const res = await researchFetch(feed.url, {
      headers: {
        "User-Agent": "DevPulse-AI/1.0 (research RSS reader)",
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
      timeoutMs,
    });
    if (!res.ok) return [];
    const buf = await res.arrayBuffer();
    const maxBytes = 1_500_000;
    const slice = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
    const xml = new TextDecoder("utf-8", { fatal: false }).decode(slice);
    return parseFeedXml(xml, feed, limit);
  } catch {
    return [];
  }
}

export interface FetchRssOptions {
  perFeed?: number;
  maxFeeds?: number;
  minPriority?: number;
  categories?: RssFeed["category"][];
  timeoutMs?: number;
}

/**
 * Pull RSS/Atom from AI company blogs, engineering blogs, and (lightly) tech news.
 */
export async function fetchRssFeeds(
  perFeedOrOpts: number | FetchRssOptions = 4,
): Promise<RawSourceItem[]> {
  const opts: FetchRssOptions =
    typeof perFeedOrOpts === "number" ? { perFeed: perFeedOrOpts } : perFeedOrOpts;

  const perFeed = opts.perFeed ?? 4;
  const timeoutMs = opts.timeoutMs ?? 12_000;
  let feeds = [...RSS_FEEDS];
  if (opts.minPriority != null) {
    feeds = feeds.filter((f) => f.priority >= opts.minPriority!);
  }
  if (opts.categories?.length) {
    const categories = new Set(opts.categories);
    feeds = feeds.filter((feed) => categories.has(feed.category));
  }
  // Highest priority first when capping
  feeds.sort((a, b) => b.priority - a.priority);
  if (opts.maxFeeds != null) {
    feeds = feeds.slice(0, opts.maxFeeds);
  }

  const batchSize = opts.maxFeeds && opts.maxFeeds <= 10 ? opts.maxFeeds : 6;
  const results: RawSourceItem[] = [];

  for (let i = 0; i < feeds.length; i += batchSize) {
    const batch = feeds.slice(i, i + batchSize);
    const settled = await Promise.all(batch.map((f) => fetchOneFeed(f, perFeed, timeoutMs)));
    for (const items of settled) results.push(...items);
  }

  return results;
}
