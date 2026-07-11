export const APP_NAME = "DevPulse AI";

export const DEFAULT_TOPICS = [
  { name: "Artificial Intelligence", keywords: "AI, artificial intelligence, generative AI" },
  { name: "Machine Learning", keywords: "ML, machine learning, deep learning" },
  { name: "LLMs", keywords: "LLM, large language model, GPT, Claude, DeepSeek" },
  { name: "Agentic AI", keywords: "AI agents, agentic, multi-agent, tool use" },
  { name: "Full-stack", keywords: "full-stack, web development, React, Next.js" },
  { name: "JavaScript", keywords: "JavaScript, JS, Node.js, npm" },
  { name: "TypeScript", keywords: "TypeScript, TS, types" },
  { name: "Python", keywords: "Python, PyPI, FastAPI, Django" },
  { name: "Cloud & AWS", keywords: "AWS, cloud, serverless, Lambda" },
  { name: "Kubernetes", keywords: "Kubernetes, K8s, containers, Docker" },
  { name: "Open Source", keywords: "open source, OSS, GitHub" },
  { name: "AI Research", keywords: "arXiv, papers, research, transformers" },
] as const;

export const DEFAULT_WRITING_STYLE = {
  name: "Senior Engineer",
  systemPrompt: `You are a senior software engineer writing social content for other engineers.
Sound human, precise, and educational. Prefer concrete technical detail over hype.
Avoid marketing buzzwords, clickbait, and AI clichés ("game-changer", "unlock", "delve", "landscape").
Be opinionated only when evidence supports it. Use short paragraphs. Emojis sparingly (0–1 max).
When helpful, include a tiny code snippet. Never invent benchmarks, funding numbers, or citations.
Posts will be copied and posted manually by the author — write ready-to-paste copy.`,
  rules: [
    "No clickbait titles",
    "Cite the underlying source when making factual claims",
    "Prefer teach-by-example over vague advice",
    "Keep X posts within 280 chars unless thread",
    "LinkedIn posts 500–2000 characters",
    "Never assume an image was uploaded — text must stand alone; image is optional attachment",
  ].join("\n"),
  examples: `X tip:
Most teams over-index on prompt length.
A shorter system prompt + better tool schemas usually beats a 2k-token personality dump.

LinkedIn:
I rewrote our agent loop this week.
The bug wasn't the model — it was unbounded retries with no idempotency key.
One line of request-id logging would have saved two days.`,
};

export const POST_STATUSES = [
  "draft",
  "pending_review",
  "approved",
  "scheduled",
  "ready",
  "posted_manually",
  "skipped",
  "rejected",
  "failed",
] as const;

export type PostStatus = (typeof POST_STATUSES)[number];

export const PLATFORMS = ["x", "linkedin"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Needs review",
  approved: "Approved",
  scheduled: "Scheduled",
  ready: "Ready to post",
  posted_manually: "Posted (manual)",
  published: "Posted (manual)",
  skipped: "Skipped",
  rejected: "Rejected",
  failed: "Failed",
};

export const STATUS_COLORS: Record<string, string> = {
  draft: "border-zinc-500/25 bg-zinc-500/10 text-zinc-300",
  pending_review: "border-amber-400/25 bg-amber-400/10 text-amber-200",
  approved: "border-emerald-400/25 bg-emerald-400/10 text-emerald-200",
  scheduled: "border-sky-400/25 bg-sky-400/10 text-sky-200",
  ready: "border-teal-400/30 bg-teal-400/12 text-teal-200",
  posted_manually: "border-violet-400/25 bg-violet-400/10 text-violet-200",
  published: "border-violet-400/25 bg-violet-400/10 text-violet-200",
  skipped: "border-zinc-500/20 bg-zinc-500/10 text-zinc-400",
  rejected: "border-rose-400/25 bg-rose-400/10 text-rose-200",
  failed: "border-red-400/25 bg-red-400/10 text-red-200",
};
