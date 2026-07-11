export type ResearchProvider = "hackernews" | "github" | "arxiv" | "reddit" | "rss" | "x";

export interface RawSourceItem {
  provider: ResearchProvider;
  externalId: string;
  title: string;
  url: string;
  summary?: string;
  score?: number;
  raw?: unknown;
}
