export type ResearchProvider =
  // Active product-first generation providers
  | "hackernews"
  | "github"
  | "arxiv"
  | "reddit"
  | "rss"
  | "huggingface"
  | "project"
  // Historical provider values remain readable for existing Source rows.
  | "x"
  | "stackoverflow"
  | "devto"
  | "producthunt"
  | "tavily";

export interface RawSourceItem {
  provider: ResearchProvider;
  externalId: string;
  title: string;
  url: string;
  summary?: string;
  score?: number;
  /** Priority weight from catalog (higher = preferred). */
  priority?: number;
  raw?: unknown;
}
