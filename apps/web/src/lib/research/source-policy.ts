import type {
  ContentStrategyConfig,
  ContentType,
} from "@/lib/content/strategy";
import type {
  RawSourceItem,
  ResearchProvider,
} from "@/lib/integrations/types";

/**
 * Product-first research policy.
 *
 * These are the only external providers allowed to feed post generation.
 * Removed providers can remain in historical Source rows, but no collector
 * invokes them and they cannot enter a newly generated post.
 */
const EXTERNAL_PROVIDERS_BY_TYPE: Record<
  ContentType,
  readonly ResearchProvider[]
> = {
  project_lesson: [],
  architecture_breakdown: ["github", "rss"],
  experiment_benchmark: ["arxiv", "huggingface"],
  evidence_opinion: ["hackernews", "reddit"],
  curated_discovery: ["github", "rss", "arxiv", "huggingface"],
};

/** Terms tied directly to DevPulse AI, Röntgen AI, and IntelliTab. */
export const PRODUCT_RESEARCH_TERMS = [
  "ai agent",
  "agentic",
  "tool use",
  "llm evaluation",
  "code generation",
  "code completion",
  "coding agent",
  "coder",
  "developer tool",
  "vscode",
  "mlx",
  "apple silicon",
  "fill in the middle",
  "speculative decoding",
  "repository",
  "code review",
  "pull request",
  "incident",
  "root cause",
  "authentication",
  "oauth",
  "content pipeline",
  "cron",
  "serverless",
  "typescript",
  "next.js",
  "postgres",
  "native ipc",
  "sql",
] as const;

const PROVIDER_CAPS: Partial<Record<ResearchProvider, number>> = {
  github: 4,
  rss: 4,
  arxiv: 4,
  huggingface: 3,
  hackernews: 3,
  reddit: 3,
};

export function externalProvidersForContentType(
  contentType: ContentType,
): readonly ResearchProvider[] {
  return EXTERNAL_PROVIDERS_BY_TYPE[contentType];
}

export function productResearchTerms(
  strategy: ContentStrategyConfig,
): string[] {
  return [
    ...PRODUCT_RESEARCH_TERMS,
    ...strategy.projects.flatMap((project) => [
      project.name,
      ...project.keywords,
    ]),
  ]
    .map((term) => term.trim().toLowerCase())
    .filter((term, index, all) => term.length >= 3 && all.indexOf(term) === index);
}

export function isProductRelevantSource(
  source: RawSourceItem,
  strategy: ContentStrategyConfig,
): boolean {
  if (source.provider === "project") return true;

  // RSS is deliberately restricted to first-party AI/company engineering
  // feeds with the highest catalog priority. Tech-news feeds never qualify.
  if (source.provider === "rss") {
    if (source.priority != null && source.priority < 5) return false;
    const category = (source.raw as { category?: string } | null)?.category;
    if (category && !["ai_company", "engineering"].includes(category)) return false;
  }

  const haystack = `${source.title} ${source.summary || ""}`.toLowerCase();
  return productResearchTerms(strategy).some((term) => haystack.includes(term));
}

export function isSourceAllowedForContentType(
  source: RawSourceItem,
  contentType: ContentType,
  strategy: ContentStrategyConfig,
): boolean {
  const allowed = new Set<ResearchProvider>([
    "project",
    ...externalProvidersForContentType(contentType),
  ]);
  return allowed.has(source.provider) && isProductRelevantSource(source, strategy);
}

/**
 * Enforce provider lanes, product relevance, and small per-provider pools.
 * This is applied after collection in both the manual and phased pipelines.
 */
export function filterSourcesForContentType(
  items: RawSourceItem[],
  contentType: ContentType,
  strategy: ContentStrategyConfig,
): RawSourceItem[] {
  const counts = new Map<ResearchProvider, number>();

  return items.filter((item) => {
    if (!isSourceAllowedForContentType(item, contentType, strategy)) return false;

    const cap = PROVIDER_CAPS[item.provider];
    if (cap == null) return true;
    const used = counts.get(item.provider) ?? 0;
    if (used >= cap) return false;
    counts.set(item.provider, used + 1);
    return true;
  });
}

export function describeSourcePolicy(contentType: ContentType): string {
  const providers = externalProvidersForContentType(contentType);
  return providers.length
    ? `${contentType}: ${providers.join(" + ")} (product-relevant only)`
    : `${contentType}: owned projects only`;
}
