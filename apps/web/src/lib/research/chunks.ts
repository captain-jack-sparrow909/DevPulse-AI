import type {
  ContentStrategyConfig,
  ContentType,
} from "@/lib/content/strategy";
import type { RawSourceItem } from "@/lib/integrations/types";
import {
  collectAllSources,
  describeSourceMix,
} from "@/lib/integrations";

/**
 * Research is split into sequential chunks so each Vercel invocation stays
 * well under the Hobby 60s limit. Cron (or a self-chained worker) runs
 * ONE chunk per tick, persists sources, then the final tick writes the post.
 */
export interface ResearchChunkDef {
  id: string;
  label: string;
  /** Soft budget hint for logs */
  budgetMs: number;
  providers: RawSourceItem["provider"][];
}

/** Community is intentionally isolated to the low-frequency opinion lane. */
const chunkCommunity: ResearchChunkDef = {
  id: "limited_community",
  label: "Limited community evidence (HN + Reddit)",
  budgetMs: 12_000,
  providers: ["hackernews", "reddit"],
};

/** GitHub and RSS only support architecture/discovery tied to the products. */
const chunkEngineering: ResearchChunkDef = {
  id: "product_engineering",
  label: "Product-relevant GitHub + official engineering RSS",
  budgetMs: 15_000,
  providers: ["github", "rss"],
};

/** Papers/models only support benchmark and curated-research slots. */
const chunkSelectiveResearch: ResearchChunkDef = {
  id: "selective_research",
  label: "Selective product-related arXiv + Hugging Face",
  budgetMs: 15_000,
  providers: ["arxiv", "huggingface"],
};

const RESEARCH_PLAN: Record<ContentType, ResearchChunkDef[]> = {
  project_lesson: [],
  architecture_breakdown: [chunkEngineering],
  evidence_opinion: [chunkCommunity],
  experiment_benchmark: [chunkSelectiveResearch],
  curated_discovery: [chunkEngineering, chunkSelectiveResearch],
};

export function researchChunksForContentType(
  contentType: ContentType,
): ResearchChunkDef[] {
  return RESEARCH_PLAN[contentType];
}

export function researchChunkCount(contentType: ContentType): number {
  return researchChunksForContentType(contentType).length;
}

export async function collectResearchChunk(
  chunkIndex: number,
  contentType: ContentType,
  strategy: ContentStrategyConfig,
): Promise<{ chunk: ResearchChunkDef; items: RawSourceItem[]; mix: string }> {
  const chunk = researchChunksForContentType(contentType)[chunkIndex];
  if (!chunk) {
    throw new Error(`Invalid ${contentType} research chunk index ${chunkIndex}`);
  }
  const items = await collectAllSources({
    mode: "fast",
    budgetMs: chunk.budgetMs,
    contentType,
    strategy,
    providers: chunk.providers,
  });
  return { chunk, items, mix: describeSourceMix(items) };
}
