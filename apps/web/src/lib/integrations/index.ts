import { PROVIDER_PRIORITY, RSS_FEEDS, REDDIT_SUBREDDITS } from "./catalog";
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

export type CollectMode = "fast" | "full";

export interface CollectOptions {
  /**
   * fast (default): ~20s budget, lean providers — required for Vercel Hobby 60s cron.
   * full: wider catalog for local / long-running manual runs.
   */
  mode?: CollectMode;
  /** Hard wall-clock cap for all collectors (ms). */
  budgetMs?: number;
}

async function settled(label: string, p: Promise<RawSourceItem[]>): Promise<{ label: string; items: RawSourceItem[] }> {
  try {
    const items = await p;
    return { label, items };
  } catch {
    return { label, items: [] };
  }
}

function dedupeAndScore(all: RawSourceItem[]): RawSourceItem[] {
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

/** High-signal subs only — full list was 15× hosts×UAs and burned the 60s budget. */
const FAST_REDDIT_SUBS = [
  "MachineLearning",
  "LocalLLaMA",
  "programming",
  "typescript",
] as const;

/**
 * Collect research signals from the information-sources catalog.
 * Never posts to any social platform — research only.
 *
 * On Vercel Hobby the whole cron is max 60s. Research must finish in ~20s
 * so DeepSeek writing still has time. Use mode:"full" only locally.
 */
export async function collectAllSources(options: CollectOptions = {}): Promise<RawSourceItem[]> {
  const mode = options.mode ?? "fast";
  const budgetMs =
    options.budgetMs ??
    (mode === "fast" ? 20_000 : 50_000);

  const bag: RawSourceItem[] = [];
  const push = (items: RawSourceItem[]) => {
    for (const i of items) bag.push(i);
  };

  const tasks: Promise<void>[] =
    mode === "fast"
      ? [
          // Lean parallel set — enough diversity for slot lanes without stampeding
          settled("hackernews", fetchHackerNews(8)).then((r) => push(r.items)),
          settled("github", fetchGithubTrending(6)).then((r) => push(r.items)),
          settled("arxiv", fetchArxiv(6)).then((r) => push(r.items)),
          settled(
            "reddit",
            fetchReddit({
              limitPerSub: 3,
              subs: [...FAST_REDDIT_SUBS],
              fast: true,
            }),
          ).then((r) => push(r.items)),
          settled(
            "rss",
            fetchRssFeeds({
              perFeed: 2,
              maxFeeds: 8,
              // Prefer AI + eng blogs (priority ≥ 4)
              minPriority: 4,
              timeoutMs: 5_000,
            }),
          ).then((r) => push(r.items)),
          settled("huggingface", fetchHuggingFace(6)).then((r) => push(r.items)),
          settled("devto", fetchDevTo(8, { tags: ["ai", "typescript"], timeoutMs: 6_000 })).then(
            (r) => push(r.items),
          ),
          settled("stackoverflow", fetchStackOverflow(6, { tags: ["typescript", "llm"], timeoutMs: 6_000 })).then(
            (r) => push(r.items),
          ),
          settled("producthunt", fetchProductHunt(4)).then((r) => push(r.items)),
          settled("tavily", fetchTavily(4, { queries: 1, timeoutMs: 8_000 })).then((r) =>
            push(r.items),
          ),
          // Skip X in fast mode — often slow / rate-limited and optional
        ]
      : [
          settled("hackernews", fetchHackerNews(20)).then((r) => push(r.items)),
          settled("github", fetchGithubTrending(14)).then((r) => push(r.items)),
          settled("arxiv", fetchArxiv(12)).then((r) => push(r.items)),
          settled("reddit", fetchReddit({ limitPerSub: 3 })).then((r) => push(r.items)),
          settled("rss", fetchRssFeeds({ perFeed: 3 })).then((r) => push(r.items)),
          settled("huggingface", fetchHuggingFace(10)).then((r) => push(r.items)),
          settled("devto", fetchDevTo(12)).then((r) => push(r.items)),
          settled("stackoverflow", fetchStackOverflow(12)).then((r) => push(r.items)),
          settled("producthunt", fetchProductHunt(6)).then((r) => push(r.items)),
          settled("tavily", fetchTavily(9)).then((r) => push(r.items)),
          settled("x", fetchXResearch(10)).then((r) => push(r.items)),
        ];

  await Promise.race([
    Promise.allSettled(tasks),
    new Promise<void>((resolve) => setTimeout(resolve, budgetMs)),
  ]);

  // Give in-flight collectors a brief grace to flush if budget fired mid-flight
  await new Promise((r) => setTimeout(r, 50));

  return dedupeAndScore(bag);
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
