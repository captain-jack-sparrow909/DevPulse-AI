import type { RawSourceItem } from "./types";
import { researchFetch } from "./fetch";

/**
 * X (Twitter) research-only — never posts.
 * Uses X_BEARER_TOKEN (app-only). Keep volume low (paid API).
 */
export async function fetchXResearch(limit = 10): Promise<RawSourceItem[]> {
  const bearer =
    process.env.X_BEARER_TOKEN?.trim() ||
    process.env.TWITTER_BEARER_TOKEN?.trim() ||
    "";

  if (!bearer) {
    return [];
  }

  const maxResults = Math.min(Math.max(limit, 10), 20); // API requires 10–100
  const query = encodeURIComponent(
    "(AI OR LLM OR TypeScript OR Kubernetes OR \"open source\" OR HuggingFace) -is:retweet lang:en",
  );

  try {
    const res = await researchFetch(
      `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=${maxResults}&tweet.fields=public_metrics,created_at`,
      {
        headers: {
          Authorization: `Bearer ${bearer}`,
          "User-Agent": "DevPulse-AI-Research/1.0",
        },
        timeoutMs: 12_000,
      },
    );

    if (!res.ok) {
      return [];
    }

    const data = (await res.json()) as {
      data?: Array<{
        id: string;
        text: string;
        public_metrics?: { like_count?: number; retweet_count?: number };
      }>;
    };

    return (data.data || []).map((t) => ({
      provider: "x" as const,
      externalId: t.id,
      title: t.text.slice(0, 120).replace(/\n/g, " "),
      url: `https://x.com/i/web/status/${t.id}`,
      summary: t.text,
      score:
        (t.public_metrics?.like_count || 0) + (t.public_metrics?.retweet_count || 0) * 2,
      priority: 3,
      raw: t,
    }));
  } catch {
    return [];
  }
}
