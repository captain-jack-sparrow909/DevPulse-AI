import { PROVIDER_PRIORITY } from "./catalog";
import { fetchArxiv } from "./arxiv";
import { fetchGithubTrending } from "./github";
import { fetchHackerNews } from "./hackernews";
import { fetchHuggingFace } from "./huggingface";
import { fetchReddit } from "./reddit";
import { fetchRssFeeds } from "./rss";
import type { RawSourceItem, ResearchProvider } from "./types";
import {
  DEFAULT_CONTENT_STRATEGY,
  type ContentStrategyConfig,
  type ContentType,
} from "@/lib/content/strategy";
import {
  externalProvidersForContentType,
  filterSourcesForContentType,
  PRODUCT_RESEARCH_TERMS,
} from "@/lib/research/source-policy";

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
  /** Source lanes are selected from the post strategy, never from a global firehose. */
  contentType?: ContentType;
  strategy?: ContentStrategyConfig;
  /** Used by phased chunks to collect one bounded provider group at a time. */
  providers?: readonly ResearchProvider[];
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

/** Community is only used for the low-frequency evidence-opinion lane. */
const FAST_REDDIT_SUBS = [
  "MachineLearning",
  "LocalLLaMA",
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
  const contentType = options.contentType ?? "curated_discovery";
  const strategy = options.strategy ?? DEFAULT_CONTENT_STRATEGY;
  const budgetMs =
    options.budgetMs ??
    (mode === "fast" ? 20_000 : 50_000);
  const policyProviders = new Set(
    options.providers ?? externalProvidersForContentType(contentType),
  );

  const bag: RawSourceItem[] = [];
  const push = (items: RawSourceItem[]) => {
    for (const i of items) bag.push(i);
  };

  const tasks: Promise<void>[] = [];
  const fast = mode === "fast";

  if (policyProviders.has("github")) {
    tasks.push(
      settled("github", fetchGithubTrending(fast ? 8 : 16)).then((r) => push(r.items)),
    );
  }
  if (policyProviders.has("arxiv")) {
    tasks.push(
      settled(
        "arxiv",
        fetchArxiv(fast ? 8 : 16, { terms: PRODUCT_RESEARCH_TERMS }),
      ).then((r) => push(r.items)),
    );
  }
  if (policyProviders.has("huggingface")) {
    tasks.push(
      settled("huggingface", fetchHuggingFace(fast ? 8 : 14)).then((r) =>
        push(r.items),
      ),
    );
  }
  if (policyProviders.has("rss")) {
    tasks.push(
      settled(
        "rss",
        fetchRssFeeds({
          perFeed: fast ? 1 : 2,
          maxFeeds: 10,
          minPriority: 5,
          categories: ["ai_company", "engineering"],
          timeoutMs: fast ? 5_000 : 8_000,
        }),
      ).then((r) => push(r.items)),
    );
  }
  if (policyProviders.has("hackernews")) {
    tasks.push(
      settled("hackernews", fetchHackerNews(fast ? 8 : 15)).then((r) =>
        push(r.items),
      ),
    );
  }
  if (policyProviders.has("reddit")) {
    tasks.push(
      settled(
        "reddit",
        fetchReddit({
          limitPerSub: fast ? 2 : 3,
          subs: [...FAST_REDDIT_SUBS],
          fast: true,
          timeoutMs: fast ? 5_000 : 8_000,
        }),
      ).then((r) => push(r.items)),
    );
  }

  await Promise.race([
    Promise.allSettled(tasks),
    new Promise<void>((resolve) => setTimeout(resolve, budgetMs)),
  ]);

  // Give in-flight collectors a brief grace to flush if budget fired mid-flight
  await new Promise((r) => setTimeout(r, 50));

  return filterSourcesForContentType(
    dedupeAndScore(bag),
    contentType,
    strategy,
  );
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
