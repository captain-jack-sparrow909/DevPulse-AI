import type { RawSourceItem } from "./types";

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

/**
 * Tavily web search — uses TAVILY_API_KEY when set.
 * Good fallback for fresh AI/eng signal when Reddit is blocked.
 */
export async function fetchTavily(limit = 8): Promise<RawSourceItem[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return [];

  const queries = [
    "latest AI model release developer news",
    "open source LLM tools GitHub trending",
    "TypeScript React infrastructure engineering blog",
  ];

  const all: RawSourceItem[] = [];

  await Promise.all(
    queries.map(async (query, qi) => {
      try {
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: Math.ceil(limit / queries.length) + 1,
            search_depth: "basic",
            include_answer: false,
          }),
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { results?: TavilyResult[] };
        for (const r of data.results ?? []) {
          if (!r.url || !r.title) continue;
          all.push({
            provider: "tavily",
            externalId: `tavily:${r.url}`,
            title: `Web: ${r.title}`,
            url: r.url,
            summary: r.content?.slice(0, 500),
            score: (r.score ?? 0.5) * 40 + 20 - qi,
            priority: 4,
            raw: { ...r, via: "tavily", query },
          });
        }
      } catch {
        // ignore
      }
    }),
  );

  const seen = new Set<string>();
  return all
    .filter((i) => {
      const k = i.url.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, limit);
}
