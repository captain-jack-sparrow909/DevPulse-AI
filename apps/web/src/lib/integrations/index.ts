import { fetchArxiv } from "./arxiv";
import { fetchGithubTrending } from "./github";
import { fetchHackerNews } from "./hackernews";
import { fetchReddit } from "./reddit";
import { fetchXResearch } from "./x-research";
import type { RawSourceItem } from "./types";

export type { RawSourceItem, ResearchProvider } from "./types";

/**
 * Collect research signals from free (and optional paid-read) sources.
 * Never posts to any social platform — research only.
 */
export async function collectAllSources(): Promise<RawSourceItem[]> {
  const [hn, gh, arxiv, reddit, x] = await Promise.all([
    fetchHackerNews(20),
    fetchGithubTrending(12),
    fetchArxiv(10),
    fetchReddit(4),
    fetchXResearch(8), // optional; only if X read bearer is configured — never posts
  ]);

  const all = [...hn, ...gh, ...arxiv, ...reddit, ...x];
  const seen = new Set<string>();
  const deduped: RawSourceItem[] = [];

  for (const item of all) {
    const key = `${item.provider}:${item.externalId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }

  return deduped;
}
