import { PROVIDER_PRIORITY } from "./catalog";
import { fetchArxiv } from "./arxiv";
import { fetchDevTo } from "./devto";
import { fetchGithubTrending } from "./github";
import { fetchHackerNews } from "./hackernews";
import { fetchHuggingFace } from "./huggingface";
import { fetchProductHunt } from "./producthunt";
import { fetchReddit } from "./reddit";
import { fetchRssFeeds } from "./rss";
import { fetchStackOverflow } from "./stackoverflow";
import { fetchTavily } from "./tavily";
import { fetchXResearch } from "./x-research";
import type { RawSourceItem } from "./types";

export type { RawSourceItem, ResearchProvider } from "./types";
export { RSS_FEEDS, REDDIT_SUBREDDITS, ARXIV_CATEGORIES } from "./catalog";

async function settled<T>(label: string, p: Promise<T[]>): Promise<{ label: string; items: T[] }> {
  try {
    const items = await p;
    return { label, items };
  } catch {
    return { label, items: [] };
  }
}

/**
 * Collect research signals from the information-sources.md catalog.
 * Never posts to any social platform — research only.
 *
 * Free / no-key: HN, GitHub (low volume), arXiv, Reddit, RSS blogs, HF, Dev.to, Stack Overflow
 * Optional keys: GITHUB_TOKEN, HF_TOKEN, DEVTO_API_KEY, STACKEXCHANGE_KEY,
 * PRODUCTHUNT_TOKEN, X_BEARER_TOKEN, TAVILY_API_KEY
 * X is used lightly (paid API) — only if bearer is set.
 */
export async function collectAllSources(): Promise<RawSourceItem[]> {
  const results = await Promise.all([
    settled("hackernews", fetchHackerNews(20)),
    settled("github", fetchGithubTrending(14)),
    settled("arxiv", fetchArxiv(12)),
    settled("reddit", fetchReddit(3)),
    settled("rss", fetchRssFeeds(3)),
    settled("huggingface", fetchHuggingFace(10)),
    settled("devto", fetchDevTo(12)),
    settled("stackoverflow", fetchStackOverflow(12)),
    settled("producthunt", fetchProductHunt(6)),
    settled("tavily", fetchTavily(9)),
    settled("x", fetchXResearch(10)), // light use only
  ]);

  const all: RawSourceItem[] = [];
  for (const r of results) {
    all.push(...r.items);
  }

  // Normalize + dedupe by URL and provider:id
  const seen = new Set<string>();
  const deduped: RawSourceItem[] = [];

  for (const item of all) {
    const urlKey = item.url.replace(/\/$/, "").toLowerCase();
    const idKey = `${item.provider}:${item.externalId}`;
    if (seen.has(urlKey) || seen.has(idKey)) continue;
    seen.add(urlKey);
    seen.add(idKey);

    const providerBoost = (PROVIDER_PRIORITY[item.provider] ?? 3) * 8;
    const priorityBoost = (item.priority ?? 3) * 5;
    deduped.push({
      ...item,
      score: (item.score ?? 0) + providerBoost + priorityBoost,
    });
  }

  return deduped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/** Human-readable source mix for pipeline logs */
export function describeSourceMix(items: RawSourceItem[]): string {
  const counts: Record<string, number> = {};
  for (const i of items) {
    counts[i.provider] = (counts[i.provider] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(" · ");
}
