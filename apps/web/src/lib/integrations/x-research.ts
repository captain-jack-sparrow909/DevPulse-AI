import type { RawSourceItem } from "./types";

/**
 * X (Twitter) research-only integration.
 *
 * IMPORTANT: DevPulse NEVER posts to X via API.
 * X posting is always manual by the user.
 * Credentials (if present) are used only to fetch public conversation/search signals.
 *
 * Supports Bearer token (app-only) via X_BEARER_TOKEN preferred,
 * or falls back to skipping when only write-oriented keys exist.
 */
export async function fetchXResearch(limit = 10): Promise<RawSourceItem[]> {
  const bearer =
    process.env.X_BEARER_TOKEN?.trim() ||
    process.env.TWITTER_BEARER_TOKEN?.trim() ||
    "";

  // Some setups put a read token in X_API_KEY — only use it if it looks like a bearer (not xai- LLM keys)
  const maybeKey = process.env.X_API_KEY?.trim() || "";
  const token =
    bearer ||
    (maybeKey && !maybeKey.startsWith("xai-") && maybeKey.length > 20 ? maybeKey : "");

  if (!token) {
    return [];
  }

  const query = encodeURIComponent(
    "(AI OR LLM OR TypeScript OR Kubernetes OR \"open source\") -is:retweet lang:en",
  );

  try {
    const res = await fetch(
      `https://api.twitter.com/2/tweets/search/recent?query=${query}&max_results=${Math.min(
        limit,
        10,
      )}&tweet.fields=public_metrics,created_at&expansions=author_id`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "User-Agent": "DevPulse-AI-Research/1.0",
        },
        next: { revalidate: 900 },
      },
    );

    if (!res.ok) {
      // Paid/restricted endpoints should fail quietly — other free sources still work
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
      raw: t,
    }));
  } catch {
    return [];
  }
}
