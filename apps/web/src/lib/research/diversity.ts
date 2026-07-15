import type { RawSourceItem, ResearchProvider } from "@/lib/integrations/types";

/** Soft cap: same provider should not dominate a 12-slot day. */
export const MAX_POSTS_PER_PROVIDER_PER_DAY = 2;

/**
 * Legacy slot-provider helper retained for callers outside the strategy engine.
 * It now mirrors the product-first 5/2/1/1/1 editorial cycle.
 *
 * Removed providers never appear here. Project sources dominate; external
 * providers are confined to their supporting lanes.
 */
export const SLOT_PROVIDER_ROTATION: ResearchProvider[][] = [
  ["project"],
  ["github", "rss"],
  ["project"],
  ["arxiv", "huggingface"],
  ["project"],
  ["hackernews", "reddit"],
  ["project"],
  ["github", "rss"],
  ["project"],
  ["github", "rss", "arxiv", "huggingface"],
];

/** Human labels for logs / UI */
export const SLOT_LANE_LABELS = [
  "project",
  "architecture",
  "project",
  "benchmark",
  "project",
  "opinion",
  "project",
  "architecture",
  "project",
  "curated",
] as const;

/**
 * Compress raw provider scores so star counts (GitHub 1k–50k) do not bury
 * HN/arXiv/RSS which sit in a ~0–200 band after boosts.
 */
export function comparableSourceScore(item: RawSourceItem): number {
  const raw = item.score ?? 0;
  // Log-compress anything that looks like engagement/star explosion
  const base = raw > 120 ? 40 + Math.log10(raw + 1) * 18 : raw;
  return base;
}

export function countProviders(
  items: Array<{ provider: string }>,
): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    m.set(it.provider, (m.get(it.provider) ?? 0) + 1);
  }
  return m;
}

export interface CandidateRef {
  id: string;
  item: RawSourceItem;
}

/**
 * Order writing candidates for this slot:
 * 1) Prefer providers in the slot's lane rotation
 * 2) Penalize providers already used today (hard soft-ban at maxPerProvider)
 * 3) Prefer unused source IDs
 * 4) Break ties with comparable (normalized) scores
 */
export function orderCandidatesForSlot(
  candidates: CandidateRef[],
  opts: {
    slotIndex: number;
    usedSourceIds: Set<string>;
    usedProviderCounts: Map<string, number>;
    maxPerProvider?: number;
  },
): CandidateRef[] {
  const maxPer = opts.maxPerProvider ?? MAX_POSTS_PER_PROVIDER_PER_DAY;
  const preferred =
    SLOT_PROVIDER_ROTATION[opts.slotIndex % SLOT_PROVIDER_ROTATION.length] ?? [];

  function rankOf(c: CandidateRef): number {
    const provider = c.item.provider;
    const usedCount = opts.usedProviderCounts.get(provider) ?? 0;
    let rank = comparableSourceScore(c.item);

    // Lane preference for this wall-clock slot
    const prefIdx = preferred.indexOf(provider as ResearchProvider);
    if (prefIdx === 0) rank += 100;
    else if (prefIdx > 0) rank += 70;
    else rank += 0;

    // Daily provider diversity
    if (usedCount >= maxPer) {
      rank -= 600; // effectively last resort
    } else {
      rank -= usedCount * 55;
    }

    // Prefer never-used sources
    if (opts.usedSourceIds.has(c.id)) {
      rank -= 200;
    }

    // Mild de-bias: github raw volumes are still high even after log
    if (provider === "github" && usedCount >= 1) {
      rank -= 40;
    }

    return rank;
  }

  return [...candidates].sort((a, b) => rankOf(b) - rankOf(a));
}

export function describeProviderCounts(counts: Map<string, number>): string {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k}:${v}`)
    .join(" · ") || "none";
}
