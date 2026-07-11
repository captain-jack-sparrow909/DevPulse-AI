import type { RawSourceItem } from "./types";
import { researchFetch } from "./fetch";

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

export interface FetchTavilyOptions {
  /** How many of the default query list to run (fast mode uses 1). */
  queries?: number;
  timeoutMs?: number;
}

/**
 * Tavily web search — uses TAVILY_API_KEY when set.
 */
export async function fetchTavily(
  limit = 8,
  options: FetchTavilyOptions = {},
): Promise<RawSourceItem[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim();
  if (!apiKey) return [];

  const allQueries = [
    "latest AI model release developer news",
    "open source LLM tools GitHub trending",
    "TypeScript React infrastructure engineering blog",
  ];
  const queryCount = Math.max(1, Math.min(options.queries ?? allQueries.length, allQueries.length));
  const queries = allQueries.slice(0, queryCount);
  const timeoutMs = options.timeoutMs ?? 15_000;

  const all: RawSourceItem[] = [];

  await Promise.all(
    queries.map(async (query, qi) => {
      try {
        const res = await researchFetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            api_key: apiKey,
            query,
            max_results: Math.ceil(limit / queries.length) + 1,
            search_depth: "basic",
            include_answer: false,
          }),
          timeoutMs,
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
