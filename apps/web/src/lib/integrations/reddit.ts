import type { RawSourceItem } from "./types";
import { REDDIT_SUBREDDITS } from "./catalog";
import { researchFetch } from "./fetch";

interface RedditChild {
  data: {
    id: string;
    title: string;
    url: string;
    selftext?: string;
    score?: number;
    permalink?: string;
    subreddit?: string;
    num_comments?: number;
  };
}

export interface FetchRedditOptions {
  limitPerSub?: number;
  /** Override catalog list (fast mode uses a short list). */
  subs?: string[];
  /**
   * One host + one UA + short timeout. Full mode tries fallbacks when blocked.
   * Fast mode is required for Vercel 60s cron.
   */
  fast?: boolean;
  timeoutMs?: number;
}

async function fetchSub(
  sub: string,
  limit: number,
  opts: { fast: boolean; timeoutMs: number },
): Promise<RawSourceItem[]> {
  const urls = opts.fast
    ? [`https://www.reddit.com/r/${sub}/hot.json?limit=${limit}&raw_json=1`]
    : [
        `https://www.reddit.com/r/${sub}/hot.json?limit=${limit}&raw_json=1`,
        `https://old.reddit.com/r/${sub}/hot.json?limit=${limit}&raw_json=1`,
      ];

  const headersList = opts.fast
    ? [
        {
          "User-Agent": "DevPulse-AI/1.0 by personal-research (research only)",
          Accept: "application/json",
        },
      ]
    : [
        {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        {
          "User-Agent": "DevPulse-AI/1.0 by personal-research (research only)",
          Accept: "application/json",
        },
      ];

  for (const url of urls) {
    for (const headers of headersList) {
      try {
        const res = await researchFetch(url, {
          headers,
          timeoutMs: opts.timeoutMs,
        });
        if (!res.ok) continue;
        const json = (await res.json()) as { data?: { children?: RedditChild[] } };
        const children = json.data?.children ?? [];
        if (!children.length) continue;

        return children
          .map((child) => {
            const d = child.data;
            if (!d?.title) return null;
            return {
              provider: "reddit" as const,
              externalId: `${sub}_${d.id}`,
              title: `[r/${sub}] ${d.title}`,
              url: d.url?.startsWith("http")
                ? d.url
                : `https://www.reddit.com${d.permalink || ""}`,
              summary: d.selftext?.slice(0, 400) || undefined,
              score: (d.score ?? 0) + (d.num_comments ?? 0),
              priority: 5,
              raw: d,
            };
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x));
      } catch {
        // try next combo
      }
    }
  }
  return [];
}

/**
 * Public Reddit JSON — no OAuth for read-only.
 * Fast mode: few subs, one attempt each (no host/UA stampede).
 */
export async function fetchReddit(
  limitPerSubOrOpts: number | FetchRedditOptions = 3,
): Promise<RawSourceItem[]> {
  const opts: FetchRedditOptions =
    typeof limitPerSubOrOpts === "number"
      ? { limitPerSub: limitPerSubOrOpts }
      : limitPerSubOrOpts;

  const limitPerSub = opts.limitPerSub ?? 3;
  const subs = opts.subs ?? [...REDDIT_SUBREDDITS];
  const fast = opts.fast ?? false;
  const timeoutMs = opts.timeoutMs ?? (fast ? 4_000 : 10_000);

  // Fast: all subs in parallel. Full: small batches to be polite.
  if (fast) {
    const parts = await Promise.all(
      subs.map((sub) => fetchSub(sub, limitPerSub, { fast: true, timeoutMs })),
    );
    return parts
      .flat()
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  const results: RawSourceItem[] = [];
  const batchSize = 4;
  for (let i = 0; i < subs.length; i += batchSize) {
    const batch = subs.slice(i, i + batchSize);
    const parts = await Promise.all(
      batch.map((sub) => fetchSub(sub, limitPerSub, { fast: false, timeoutMs })),
    );
    for (const items of parts) results.push(...items);
  }

  return results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
