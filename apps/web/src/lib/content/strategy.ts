import type { RawSourceItem } from "@/lib/integrations/types";

export type ContentType =
  | "project_lesson"
  | "architecture_breakdown"
  | "evidence_opinion"
  | "experiment_benchmark"
  | "curated_discovery";

export interface StrategyPillar {
  id: string;
  name: string;
  description: string;
  keywords: string[];
}

export interface StrategyProject {
  id: string;
  name: string;
  repository: string;
  url: string;
  description: string;
  keywords: string[];
}

export interface ContentMixItem {
  type: ContentType;
  label: string;
  weight: number;
  guidance: string;
}

export interface ContentStrategyConfig {
  targetAudience: string;
  positioning: string;
  pillars: StrategyPillar[];
  projects: StrategyProject[];
  contentMix: ContentMixItem[];
  excludedTopics: string;
}

export interface StoredContentStrategy {
  targetAudience: string;
  positioning: string;
  pillarsJson: string;
  projectsJson: string;
  contentMixJson: string;
  excludedTopics: string;
}

export const DEFAULT_CONTENT_STRATEGY: ContentStrategyConfig = {
  targetAudience:
    "Software engineers building AI-powered products, production agent systems, and modern full-stack developer tools.",
  positioning:
    "A software engineer building real AI products in public and sharing architecture decisions, measured tradeoffs, failures, and reusable implementation lessons.",
  pillars: [
    {
      id: "production-ai",
      name: "Production AI agents & LLM systems",
      description:
        "Reliable agents, tool use, evaluation, inference, RAG, orchestration, latency, and production operations.",
      keywords: [
        "ai agent",
        "agentic",
        "llm",
        "tool use",
        "rag",
        "evaluation",
        "inference",
        "reasoning",
        "prompt",
        "mlx",
        "code completion",
      ],
    },
    {
      id: "full-stack-architecture",
      name: "TypeScript, Next.js & full-stack architecture",
      description:
        "APIs, authentication, databases, serverless systems, cloud infrastructure, state machines, and reliability.",
      keywords: [
        "typescript",
        "next.js",
        "react",
        "node.js",
        "api",
        "oauth",
        "authentication",
        "postgres",
        "supabase",
        "serverless",
        "vercel",
        "cloudflare",
        "architecture",
        "reliability",
      ],
    },
    {
      id: "building-products",
      name: "Building real AI products in public",
      description:
        "Concrete lessons from DevPulse AI, Röntgen AI, IntelliTab, and related engineering work.",
      keywords: [
        "developer tools",
        "vscode",
        "github app",
        "code review",
        "incident",
        "pipeline",
        "latency",
        "product engineering",
        "build in public",
        "open source",
      ],
    },
  ],
  projects: [
    {
      id: "devpulse-ai",
      name: "DevPulse AI",
      repository: "captain-jack-sparrow909/DevPulse-AI",
      url: "https://github.com/captain-jack-sparrow909/DevPulse-AI",
      description:
        "Research-first content studio built with Next.js, Prisma/Postgres, DeepSeek, resumable cron phases, slot scheduling, manual approval, and Cloudflare R2 screenshots.",
      keywords: [
        "content pipeline",
        "resumable jobs",
        "cron",
        "deepseek",
        "next.js",
        "prisma",
        "postgres",
        "cloudflare r2",
        "state machine",
      ],
    },
    {
      id: "rontgen-ai",
      name: "Röntgen AI",
      repository: "captain-jack-sparrow909/rontgenai",
      url: "https://github.com/captain-jack-sparrow909/rontgenai",
      description:
        "Multi-product AI suite for engineers covering architecture review, spreadsheet and SQL chat, repository explanation, PR review, issue-to-PR automation, and production incident RCA.",
      keywords: [
        "architecture review",
        "sql",
        "repository explainer",
        "pull request review",
        "issue to pr",
        "incident rca",
        "fastify",
        "supabase",
        "developer platform",
      ],
    },
    {
      id: "intellitab",
      name: "IntelliTab",
      repository: "captain-jack-sparrow909/IntelliTab",
      url: "https://github.com/captain-jack-sparrow909/IntelliTab",
      description:
        "Low-latency local AI code completion for VS Code using TypeScript, a persistent Python MLX process, native length-prefixed IPC, FIM prompting, adaptive context, streaming, cancellation, speculative decoding, and dual-model routing on Apple Silicon.",
      keywords: [
        "mlx",
        "apple silicon",
        "vscode extension",
        "code completion",
        "fill in the middle",
        "fim",
        "native ipc",
        "speculative decoding",
        "time to first token",
        "qwen coder",
      ],
    },
  ],
  contentMix: [
    {
      type: "project_lesson",
      label: "Real project lesson",
      weight: 5,
      guidance:
        "Teach one concrete architecture decision, implementation pattern, constraint, or lesson grounded only in the supplied project facts.",
    },
    {
      type: "architecture_breakdown",
      label: "Architecture or code breakdown",
      weight: 2,
      guidance:
        "Explain how a system works, why its boundaries exist, and the tradeoff an engineer can reuse.",
    },
    {
      type: "evidence_opinion",
      label: "Evidence-backed opinion",
      weight: 1,
      guidance:
        "Take a clear position supported by the source. State uncertainty and never turn speculation into fact.",
    },
    {
      type: "experiment_benchmark",
      label: "Experiment or benchmark",
      weight: 1,
      guidance:
        "Discuss a measured result or a testable experiment. Never invent a metric that is not present in the source.",
    },
    {
      type: "curated_discovery",
      label: "Curated external discovery",
      weight: 1,
      guidance:
        "Share a relevant external tool, paper, or engineering article and add a distinct implication for the target audience.",
    },
  ],
  excludedTopics: [
    "dermatology, medical imaging, healthcare",
    "consumer lifestyle, entertainment",
    "generic career advice",
    "unrelated product launches",
    "beginner examples with no production lesson",
  ].join("\n"),
};

const CONTENT_TYPES = new Set<ContentType>([
  "project_lesson",
  "architecture_breakdown",
  "evidence_opinion",
  "experiment_benchmark",
  "curated_discovery",
]);

const VERIFIED_PROJECT_FACTS: Record<string, string[]> = {
  "devpulse-ai": [
    "The phased pipeline stores nextChunkIndex and totalChunks as JSON metadata on ResearchRun.topicsRanked, while GenerationJob.status tracks research, write, completed, or failed state.",
    "runPhasesWithBudget executes as many research or write phases as fit within a 52-second budget; an incomplete open job continues on the next external 15-minute cron tick.",
    "A research-chunk exception marks that GenerationJob failed. A later cron run starts a fresh job; it does not resume a failed chunk through a retry_count column.",
    "The fast cron path defers screenshots. Optional screenshot capture is a separate step and can store the image in Cloudflare R2.",
    "Generated X and LinkedIn drafts require manual approval and manual posting.",
  ],
  "rontgen-ai": [
    "The repository describes six engineering products: Blueprint, Pulse, Atlas, Sentinel, Forge, and Radar.",
    "The products cover architecture review, spreadsheet and SQL chat, repository explanation, PR review, issue-to-PR automation, and incident root-cause analysis.",
  ],
  intellitab: [
    "The VS Code extension communicates with a persistent Python MLX server through length-prefixed JSON over stdin and stdout.",
    "The README explicitly says there is no REST server, Ollama, or OpenAI-compatible API in the local completion path; it uses native IPC.",
    "The default local model described by the README is Qwen2.5-Coder-3B base in 4-bit form at roughly 2GB.",
    "The repository describes fill-in-the-middle prompting, adaptive imports and scope context, streaming, progressive rendering, cancel-on-type, speculative decoding, and dual-model routing on Apple Silicon.",
    "Its README describes a hardware-dependent first-token target of roughly 150–250ms; this is a target, not a guaranteed measured result for every machine.",
  ],
};

function safeArray<T>(raw: string, fallback: T[]): T[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

export function strategyFromRecord(record?: StoredContentStrategy | null): ContentStrategyConfig {
  if (!record) return DEFAULT_CONTENT_STRATEGY;
  const normalized = normalizeContentStrategy({
    targetAudience: record.targetAudience,
    positioning: record.positioning,
    pillars: safeArray(record.pillarsJson, DEFAULT_CONTENT_STRATEGY.pillars),
    projects: safeArray(record.projectsJson, DEFAULT_CONTENT_STRATEGY.projects),
    contentMix: safeArray(record.contentMixJson, DEFAULT_CONTENT_STRATEGY.contentMix),
    excludedTopics: record.excludedTopics,
  });
  const weights = new Map(
    normalized.contentMix.map((item) => [item.type, item.weight]),
  );
  const isLegacyDefaultMix =
    weights.size === 5 &&
    weights.get("project_lesson") === 4 &&
    weights.get("architecture_breakdown") === 2 &&
    weights.get("evidence_opinion") === 2 &&
    weights.get("experiment_benchmark") === 1 &&
    weights.get("curated_discovery") === 1;

  // Existing Phase 2 default rows should adopt the new product-first mix in
  // memory. Any genuinely customized mix remains untouched.
  return isLegacyDefaultMix
    ? { ...normalized, contentMix: DEFAULT_CONTENT_STRATEGY.contentMix }
    : normalized;
}

export function normalizeContentStrategy(
  input: Partial<ContentStrategyConfig>,
): ContentStrategyConfig {
  const pillars = (input.pillars ?? DEFAULT_CONTENT_STRATEGY.pillars)
    .filter((p) => p?.name?.trim())
    .map((p, index) => ({
      id: p.id?.trim() || `pillar-${index + 1}`,
      name: p.name.trim(),
      description: p.description?.trim() || "",
      keywords: (p.keywords ?? []).map((k) => k.trim()).filter(Boolean),
    }))
    .slice(0, 6);

  const projects = (input.projects ?? DEFAULT_CONTENT_STRATEGY.projects)
    .filter((p) => p?.name?.trim())
    .map((p, index) => ({
      id: p.id?.trim() || `project-${index + 1}`,
      name: p.name.trim(),
      repository: p.repository?.trim() || "",
      url: p.url?.trim() || "",
      description: p.description?.trim() || "",
      keywords: (p.keywords ?? []).map((k) => k.trim()).filter(Boolean),
    }))
    .slice(0, 12);

  const contentMix = (input.contentMix ?? DEFAULT_CONTENT_STRATEGY.contentMix)
    .filter((item) => CONTENT_TYPES.has(item.type))
    .map((item) => ({
      ...item,
      label: item.label?.trim() || item.type,
      guidance: item.guidance?.trim() || "",
      weight: Math.max(0, Math.min(10, Math.round(Number(item.weight) || 0))),
    }))
    .filter((item) => item.weight > 0);

  return {
    targetAudience:
      input.targetAudience?.trim() || DEFAULT_CONTENT_STRATEGY.targetAudience,
    positioning: input.positioning?.trim() || DEFAULT_CONTENT_STRATEGY.positioning,
    pillars: pillars.length ? pillars : DEFAULT_CONTENT_STRATEGY.pillars,
    projects: projects.length ? projects : DEFAULT_CONTENT_STRATEGY.projects,
    contentMix: contentMix.length ? contentMix : DEFAULT_CONTENT_STRATEGY.contentMix,
    excludedTopics: input.excludedTopics?.trim() ?? DEFAULT_CONTENT_STRATEGY.excludedTopics,
  };
}

export function strategyToRecord(strategy: ContentStrategyConfig): StoredContentStrategy {
  const normalized = normalizeContentStrategy(strategy);
  return {
    targetAudience: normalized.targetAudience,
    positioning: normalized.positioning,
    pillarsJson: JSON.stringify(normalized.pillars),
    projectsJson: JSON.stringify(normalized.projects),
    contentMixJson: JSON.stringify(normalized.contentMix),
    excludedTopics: normalized.excludedTopics,
  };
}

export function contentTypeForSlot(
  slotIndex: number,
  mix: ContentMixItem[],
): ContentMixItem {
  const weighted = mix.filter((item) => item.weight > 0);
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  const used = new Map<ContentType, number>();
  const rotation: ContentMixItem[] = [];

  // Smoothly distribute weighted items instead of grouping all four project
  // lessons together at the beginning of each ten-post cycle.
  for (let position = 0; position < total; position++) {
    const next = [...weighted].sort((a, b) => {
      const aDeficit = ((position + 1) * a.weight) / total - (used.get(a.type) ?? 0);
      const bDeficit = ((position + 1) * b.weight) / total - (used.get(b.type) ?? 0);
      return bDeficit - aDeficit;
    })[0];
    if (!next) break;
    rotation.push(next);
    used.set(next.type, (used.get(next.type) ?? 0) + 1);
  }
  return rotation[slotIndex % rotation.length] ?? DEFAULT_CONTENT_STRATEGY.contentMix[0]!;
}

function keywordMatchScore(haystack: string, keywords: string[]): number {
  let score = 0;
  for (const keyword of keywords) {
    const term = keyword.trim().toLowerCase();
    if (!term || !haystack.includes(term)) continue;
    score += term.includes(" ") ? 24 : term.length >= 6 ? 14 : 7;
  }
  return score;
}

function exclusions(strategy: ContentStrategyConfig): string[] {
  return strategy.excludedTopics
    .split(/[\n,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function strategyRelevanceScore(
  source: RawSourceItem,
  strategy: ContentStrategyConfig,
): number {
  const haystack = `${source.title} ${source.summary || ""}`.toLowerCase();
  if (exclusions(strategy).some((term) => term.length > 3 && haystack.includes(term))) {
    return -1_000;
  }

  let score = 0;
  for (const pillar of strategy.pillars) {
    const matches = keywordMatchScore(haystack, pillar.keywords);
    if (matches > 0) score += 35 + matches;
  }
  for (const project of strategy.projects) {
    const projectHaystack = `${project.name} ${project.repository}`.toLowerCase();
    const matches = keywordMatchScore(haystack, project.keywords);
    if (haystack.includes(project.name.toLowerCase()) || haystack.includes(projectHaystack)) {
      score += 120;
    }
    score += matches;
  }
  if (source.provider === "project") score += 180;
  return score;
}

function typeAffinity(source: RawSourceItem, contentType: ContentType): number {
  const haystack = `${source.title} ${source.summary || ""}`.toLowerCase();
  if (contentType === "project_lesson") return source.provider === "project" ? 420 : -40;
  if (contentType === "architecture_breakdown") {
    return /architect|pipeline|system|api|database|state|ipc|server|extension/.test(haystack)
      ? 130
      : 0;
  }
  if (contentType === "evidence_opinion") {
    return ["hackernews", "reddit", "rss", "x"].includes(source.provider) ? 90 : 0;
  }
  if (contentType === "experiment_benchmark") {
    return /benchmark|latency|performance|experiment|evaluation|metric|token/.test(haystack)
      ? 160
      : 0;
  }
  return source.provider === "project" ? -520 : 140;
}

function comparableScore(source: RawSourceItem): number {
  const raw = source.score ?? 0;
  return raw > 120 ? 40 + Math.log10(raw + 1) * 18 : raw;
}

export interface StrategyCandidateRef {
  id: string;
  item: RawSourceItem;
}

export function orderCandidatesForStrategy(
  candidates: StrategyCandidateRef[],
  options: {
    strategy: ContentStrategyConfig;
    contentType: ContentType;
    usedSourceIds: Set<string>;
    usedProviderCounts: Map<string, number>;
    maxPerProvider?: number;
  },
): StrategyCandidateRef[] {
  const maxPerProvider = options.maxPerProvider ?? 2;
  const rank = (candidate: StrategyCandidateRef) => {
    const source = candidate.item;
    const usedProvider = options.usedProviderCounts.get(source.provider) ?? 0;
    let value = comparableScore(source);
    value += strategyRelevanceScore(source, options.strategy);
    value += typeAffinity(source, options.contentType);
    if (options.usedSourceIds.has(candidate.id)) value -= 260;
    if (source.provider !== "project") {
      value -= usedProvider * 50;
      if (usedProvider >= maxPerProvider) value -= 500;
    }
    return value;
  };
  return [...candidates].sort((a, b) => rank(b) - rank(a));
}

export function projectSources(strategy: ContentStrategyConfig): RawSourceItem[] {
  return strategy.projects.map((project) => {
    const facts = VERIFIED_PROJECT_FACTS[project.id] ?? [];
    return {
      provider: "project",
      externalId: `owned:${project.id}`,
      title: `${project.name}: owned project context`,
      url: project.url,
      summary: [
        `Project overview: ${project.description}`,
        facts.length ? `Verified facts:\n- ${facts.join("\n- ")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      score: 220,
      priority: 5,
      raw: {
        repository: project.repository,
        ownedProject: true,
        verifiedFacts: facts,
      },
    };
  });
}

export function buildStrategyPrompt(
  strategy: ContentStrategyConfig,
  contentType: ContentMixItem,
): string {
  const pillars = strategy.pillars
    .map((pillar) => `- ${pillar.name}: ${pillar.description}`)
    .join("\n");
  const projects = strategy.projects
    .map((project) => `- ${project.name} (${project.repository}): ${project.description}`)
    .join("\n");
  return `Target audience: ${strategy.targetAudience}\nCreator positioning: ${strategy.positioning}\n\nEditorial pillars:\n${pillars}\n\nOwned project context:\n${projects}\n\nContent type for this slot: ${contentType.label}\n${contentType.guidance}\n\nExcluded topics:\n${strategy.excludedTopics || "None"}\n\nAuthenticity rule: owned project descriptions are trusted facts, but never invent personal experiences, failures, metrics, implementation details, or outcomes that are not explicitly supplied.`;
}
