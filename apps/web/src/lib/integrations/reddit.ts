import type { RawSourceItem } from "./types";

interface RedditChild {
  data: {
    id: string;
    title: string;
    url: string;
    selftext?: string;
    score?: number;
    permalink?: string;
    subreddit?: string;
  };
}

const SUBREDDITS = ["MachineLearning", "LocalLLaMA", "programming", "typescript", "kubernetes"];

/**
 * Public Reddit JSON endpoints — no OAuth needed for read-only browsing.
 */
export async function fetchReddit(limitPerSub = 5): Promise<RawSourceItem[]> {
  const results: RawSourceItem[] = [];

  await Promise.all(
    SUBREDDITS.map(async (sub) => {
      try {
        const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=${limitPerSub}`, {
          headers: { "User-Agent": "DevPulse-AI/1.0 (personal research bot)" },
          next: { revalidate: 600 },
        });
        if (!res.ok) return;
        const json = (await res.json()) as { data?: { children?: RedditChild[] } };
        const children = json.data?.children ?? [];
        for (const child of children) {
          const d = child.data;
          if (!d?.title || d.title.startsWith("[")) continue;
          results.push({
            provider: "reddit",
            externalId: `${sub}_${d.id}`,
            title: `[r/${sub}] ${d.title}`,
            url: d.url?.startsWith("http")
              ? d.url
              : `https://www.reddit.com${d.permalink || ""}`,
            summary: d.selftext?.slice(0, 400) || undefined,
            score: d.score ?? 0,
            raw: d,
          });
        }
      } catch {
        // ignore individual subreddit failures
      }
    }),
  );

  return results.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
