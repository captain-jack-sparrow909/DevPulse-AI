import { PROVIDER_PRIORITY } from "@/lib/integrations/catalog";
import { fetchArxiv } from "@/lib/integrations/arxiv";
import { fetchDevTo } from "@/lib/integrations/devto";
import { fetchGithubTrending } from "@/lib/integrations/github";
import { fetchHackerNews } from "@/lib/integrations/hackernews";
import { fetchHuggingFace } from "@/lib/integrations/huggingface";
import { fetchProductHunt } from "@/lib/integrations/producthunt";
import { fetchReddit } from "@/lib/integrations/reddit";
import { fetchRssFeeds } from "@/lib/integrations/rss";
import { fetchStackOverflow } from "@/lib/integrations/stackoverflow";
import { fetchTavily } from "@/lib/integrations/tavily";
import { fetchXResearch } from "@/lib/integrations/x-research";
import type { RawSourceItem } from "@/lib/integrations/types";
import { describeSourceMix } from "@/lib/integrations";

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
  collect: () => Promise<RawSourceItem[]>;
}

async function settled(p: Promise<RawSourceItem[]>): Promise<RawSourceItem[]> {
  try {
    return await p;
  } catch {
    return [];
  }
}

function scoreItems(items: RawSourceItem[]): RawSourceItem[] {
  return items.map((item) => {
    const providerBoost = (PROVIDER_PRIORITY[item.provider] ?? 3) * 8;
    const priorityBoost = (item.priority ?? 3) * 5;
    return {
      ...item,
      score: (item.score ?? 0) + providerBoost + priorityBoost,
    };
  });
}

/** Chunk 0 — community signal */
const chunkCommunity: ResearchChunkDef = {
  id: "community",
  label: "HN + Reddit",
  budgetMs: 25_000,
  collect: async () => {
    const [hn, reddit] = await Promise.all([
      settled(fetchHackerNews(15)),
      settled(
        fetchReddit({
          limitPerSub: 4,
          subs: ["MachineLearning", "LocalLLaMA", "programming", "typescript", "artificial"],
          fast: true,
          timeoutMs: 5_000,
        }),
      ),
    ]);
    return scoreItems([...hn, ...reddit]);
  },
};

/** Chunk 1 — code + papers */
const chunkCodeResearch: ResearchChunkDef = {
  id: "code_research",
  label: "GitHub + arXiv + Hugging Face",
  budgetMs: 25_000,
  collect: async () => {
    const [gh, arxiv, hf] = await Promise.all([
      settled(fetchGithubTrending(12)),
      settled(fetchArxiv(10)),
      settled(fetchHuggingFace(10)),
    ]);
    return scoreItems([...gh, ...arxiv, ...hf]);
  },
};

/** Chunk 2 — blogs */
const chunkBlogs: ResearchChunkDef = {
  id: "blogs",
  label: "RSS + Dev.to",
  budgetMs: 25_000,
  collect: async () => {
    const [rss, devto] = await Promise.all([
      settled(
        fetchRssFeeds({
          perFeed: 3,
          maxFeeds: 12,
          minPriority: 4,
          timeoutMs: 6_000,
        }),
      ),
      settled(fetchDevTo(12, { tags: ["ai", "typescript", "webdev"], timeoutMs: 7_000 })),
    ]);
    return scoreItems([...rss, ...devto]);
  },
};

/** Chunk 3 — Q&A + discovery */
const chunkDiscovery: ResearchChunkDef = {
  id: "discovery",
  label: "SO + Product Hunt + Tavily + light X",
  budgetMs: 25_000,
  collect: async () => {
    const [so, ph, tavily, x] = await Promise.all([
      settled(
        fetchStackOverflow(10, {
          tags: ["typescript", "llm", "reactjs", "next.js"],
          timeoutMs: 7_000,
        }),
      ),
      settled(fetchProductHunt(6)),
      settled(fetchTavily(6, { queries: 2, timeoutMs: 10_000 })),
      settled(fetchXResearch(8)),
    ]);
    return scoreItems([...so, ...ph, ...tavily, ...x]);
  },
};

export const RESEARCH_CHUNKS: ResearchChunkDef[] = [
  chunkCommunity,
  chunkCodeResearch,
  chunkBlogs,
  chunkDiscovery,
];

export function researchChunkCount(): number {
  return RESEARCH_CHUNKS.length;
}

export async function collectResearchChunk(
  chunkIndex: number,
): Promise<{ chunk: ResearchChunkDef; items: RawSourceItem[]; mix: string }> {
  const chunk = RESEARCH_CHUNKS[chunkIndex];
  if (!chunk) {
    throw new Error(`Invalid research chunk index ${chunkIndex}`);
  }
  const items = await chunk.collect();
  return { chunk, items, mix: describeSourceMix(items) };
}
