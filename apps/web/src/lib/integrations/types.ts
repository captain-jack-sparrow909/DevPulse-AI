export type ResearchProvider =
  | "hackernews"
  | "github"
  | "arxiv"
  | "reddit"
  | "rss"
  | "x"
  | "huggingface"
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
