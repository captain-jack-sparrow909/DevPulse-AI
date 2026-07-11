/**
 * Source catalog derived from information-sources.md
 * Collectors use free public endpoints / RSS. Optional tokens only raise limits.
 */

export type FeedCategory =
  | "ai_company"
  | "engineering"
  | "tech_news"
  | "community"
  | "research";

export interface RssFeed {
  name: string;
  url: string;
  category: FeedCategory;
  /** 1–5 stars from the scope doc */
  priority: number;
}

/** Highest-priority AI company + eng blogs + sparingly used tech news (RSS). */
export const RSS_FEEDS: RssFeed[] = [
  // AI companies ⭐⭐⭐⭐⭐
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml", category: "ai_company", priority: 5 },
  { name: "Anthropic", url: "https://raw.githubusercontent.com/Olshansk/rss-feeds/main/feeds/feed_anthropic_news.xml", category: "ai_company", priority: 5 },
  { name: "Google DeepMind", url: "https://deepmind.google/blog/rss.xml", category: "ai_company", priority: 5 },
  { name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/", category: "ai_company", priority: 5 },
  { name: "Meta AI", url: "https://ai.meta.com/blog/rss/", category: "ai_company", priority: 5 },
  { name: "Mistral", url: "https://mistral.ai/news/rss.xml", category: "ai_company", priority: 5 },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml", category: "ai_company", priority: 5 },
  { name: "xAI", url: "https://x.ai/blog/rss.xml", category: "ai_company", priority: 4 },

  // Company engineering blogs ⭐⭐⭐⭐⭐
  { name: "Netflix TechBlog", url: "https://netflixtechblog.com/feed", category: "engineering", priority: 5 },
  { name: "Cloudflare Blog", url: "https://blog.cloudflare.com/rss/", category: "engineering", priority: 5 },
  { name: "Stripe Engineering", url: "https://stripe.com/blog/feed.rss", category: "engineering", priority: 5 },
  { name: "Uber Engineering", url: "https://www.uber.com/blog/engineering/rss/", category: "engineering", priority: 4 },
  { name: "Airbnb Engineering", url: "https://medium.com/feed/airbnb-engineering", category: "engineering", priority: 4 },
  { name: "Shopify Engineering", url: "https://shopify.engineering/blog.atom", category: "engineering", priority: 4 },
  { name: "Dropbox Tech", url: "https://dropbox.tech/feed", category: "engineering", priority: 4 },
  { name: "GitHub Blog", url: "https://github.blog/feed/", category: "engineering", priority: 4 },
  { name: "AWS Architecture", url: "https://aws.amazon.com/blogs/architecture/feed/", category: "engineering", priority: 4 },
  { name: "Kubernetes Blog", url: "https://kubernetes.io/feed.xml", category: "engineering", priority: 4 },
  // Avoid https://vercel.com/atom — full feed is multi‑MB and breaks Next cache limits

  // Tech news (use sparingly — lower priority) ⭐⭐⭐⭐
  { name: "TechCrunch AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", category: "tech_news", priority: 3 },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", category: "tech_news", priority: 3 },
  { name: "The Verge AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", category: "tech_news", priority: 3 },
  { name: "VentureBeat AI", url: "https://venturebeat.com/category/ai/feed/", category: "tech_news", priority: 3 },
];

export const REDDIT_SUBREDDITS = [
  "MachineLearning",
  "LocalLLaMA",
  "LangChain",
  "artificial",
  "Python",
  "programming",
  "reactjs",
  "javascript",
  "node",
  "devops",
  "aws",
  "kubernetes",
  "typescript",
  "openai",
  "LocalLLM",
] as const;

export const ARXIV_CATEGORIES = ["cs.AI", "cs.LG", "cs.CL", "cs.CV", "cs.RO"] as const;

/**
 * Provider weight multipliers for ranking (1–5).
 * Keep these close — slot rotation + daily quotas handle mix; large gaps
 * (or raw GitHub star counts) made every post a repo spotlight.
 */
export const PROVIDER_PRIORITY: Record<string, number> = {
  hackernews: 5,
  arxiv: 5,
  huggingface: 5,
  rss: 5,
  reddit: 4,
  github: 4, // repos are one lane, not the default day
  devto: 4,
  stackoverflow: 4,
  tavily: 4,
  producthunt: 3,
  x: 3, // paid / use lightly
};
