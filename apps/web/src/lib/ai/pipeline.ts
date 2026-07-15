import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { collectAllSources, describeSourceMix, type RawSourceItem } from "@/lib/integrations";
import { diversifySources } from "@/lib/research/ingest";
import {
  describeProviderCounts,
  MAX_POSTS_PER_PROVIDER_PER_DAY,
} from "@/lib/research/diversity";
import { describeSourcePolicy } from "@/lib/research/source-policy";
import { DEFAULT_WRITING_STYLE } from "@/lib/constants";
import { contentHash } from "@/lib/hash";
import { chatCompletion, isAiConfigured } from "./client";
import { ANGLES, PROMPTS } from "./prompts";
import {
  blendQualityScores,
  heuristicScore,
  parseScores,
  scoreDualDraft,
  type QualityScores,
} from "./scoring";
import {
  buildSlotPlan,
  dayBoundsUtc,
  formatSlotDateTime,
  listStaleMissedDueSlots,
  pickSlotForGeneration,
} from "@/lib/schedule/slots";
import {
  clearSlotForRegenerate,
  getOccupiedSlotIndexes,
  skipSlot,
} from "@/lib/schedule/slot-actions";
import { capturePageScreenshot, shouldIncludeImage } from "@/lib/screenshots/capture";
import {
  enforceXLimit,
  splitIntoXChunks,
  X_CHAR_LIMIT,
} from "@/lib/content/platforms";
import { getContentStrategy } from "@/lib/content/strategy-store";
import {
  buildStrategyPrompt,
  contentTypeForSlot,
  orderCandidatesForStrategy,
  projectSources,
  strategyFromRecord,
} from "@/lib/content/strategy";
import {
  buildEngagementPrompt,
  engagementBriefForSlot,
  maxTextSimilarity,
  parseDraftCandidates,
  selectBestDraft,
  type DualDraft,
  type EngagementBrief,
} from "@/lib/content/engagement";
import { sourceItemKey, upsertResearchSources } from "@/lib/research/source-store";

export interface PipelineOptions {
  userId: string;
  /** Force a specific slot (0–11). If omitted, picks the next prep/due slot. */
  slotIndex?: number;
  /**
   * Research breadth. Default "fast" fits Vercel Hobby 60s (research ~20s + write).
   * Use "full" only for local long runs.
   */
  researchMode?: "fast" | "full";
  /** Skip screenshot capture (saves ~15–40s). Default true in fast mode. */
  skipScreenshot?: boolean;
  /**
   * If true, generate even when the slot time has not arrived yet
   * (manual “prepare next slot early” — still only ONE post).
   */
  allowEarly?: boolean;
  /**
   * Clear any existing post for the target slot today, then generate a fresh one.
   * Requires slotIndex (explicit target).
   */
  regenerate?: boolean;
  platforms?: Array<"x" | "linkedin">;
  onLog?: (message: string) => void;
}

export interface PipelineResult {
  jobId: string | null;
  researchRunId: string | null;
  postsCreated: number;
  sourcesFound: number;
  logs: string[];
  skipped?: boolean;
  skipReason?: string;
  slotIndex?: number;
  scheduledFor?: string;
}

function log(logs: string[], message: string, onLog?: (m: string) => void) {
  const line = `[${new Date().toISOString()}] ${message}`;
  logs.push(line);
  onLog?.(line);
}

function rankSources(sources: RawSourceItem[], topicKeywords: string[]): RawSourceItem[] {
  const kws = topicKeywords.map((k) => k.toLowerCase());
  return [...sources]
    .map((s) => {
      const hay = `${s.title} ${s.summary || ""}`.toLowerCase();
      const topicBoost = kws.some((k) => hay.includes(k)) ? 30 : 0;
      return { s, rank: (s.score ?? 0) + topicBoost };
    })
    .sort((a, b) => b.rank - a.rank)
    .map((x) => x.s);
}

function pickAngle(index: number): string {
  return ANGLES[index % ANGLES.length];
}

function demoDualContent(source: RawSourceItem, angle: string): DualDraft {
  const hook = source.title.slice(0, 80);
  const summary = source.summary?.slice(0, 400) || "Fresh signal from the engineering feed.";
  const linkedIn = `${hook}

${summary}

Why it matters (${angle}):
- Grounded in a real ${source.provider} source, not invented hype
- Easy to turn into a deeper write-up or internal share
- Worth tracking if you ship production systems

Read more: ${source.url}

#engineering #software #ai`;

  const xBody = `${hook}

${angle} — from ${source.provider}. Worth a look if you care about shipping real systems.

${source.url}`;
  const xThread = enforceXLimit(splitIntoXChunks(xBody, X_CHAR_LIMIT));

  return { title: hook, hook, linkedIn, xThread };
}

async function generateDualWithAi(params: {
  source: RawSourceItem;
  angle: string;
  stylePrompt: string;
  rules: string;
  engagementBrief: EngagementBrief;
}): Promise<DualDraft[]> {
  const user = `Turn ONE source into platform-native social content.

Angle: ${params.angle}
Source title: ${params.source.title}
Source url: ${params.source.url}
Source summary: ${params.source.summary || "n/a"}
Provider: ${params.source.provider}

Match the source type:
- project → owned-project architecture or implementation lesson; use only supplied facts
- github / official RSS → product-relevant architecture or curated discovery
- arxiv / huggingface → selective product-related experiment or research insight
- hackernews / reddit → evidence-backed opinion slots only

Rules:
${params.rules}

${buildEngagementPrompt(params.engagementBrief)}`;

  const raw = await chatCompletion({
    system:
      params.stylePrompt +
      "\n\nProduce factual, ready-to-paste LinkedIn and X copy. Follow the JSON schema exactly.",
    user,
    temperature: 0.82,
    maxTokens: 3200,
    json: true,
  });
  return parseDraftCandidates(raw, params.source.title);
}

async function scoreContent(
  content: string,
  platform: string,
  useAi: boolean,
): Promise<QualityScores> {
  if (!useAi) return heuristicScore(content, platform);

  try {
    const raw = await chatCompletion({
      system: PROMPTS.scorer.system,
      user: `Platform: ${platform}\n\nPost:\n${content}`,
      temperature: 0.2,
      json: true,
      maxTokens: 400,
    });
    return parseScores(raw) || heuristicScore(content, platform);
  } catch {
    return heuristicScore(content, platform);
  }
}

export async function ensureUserDefaults(userId: string) {
  const [existingSettings, existingStrategy] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.contentStrategy.findUnique({ where: { userId } }),
  ]);
  if (existingSettings && existingStrategy) {
    return {
      ...existingSettings,
      contentStrategy: strategyFromRecord(existingStrategy),
    };
  }

  const [settings, topicCount, style, model, contentStrategy] = await Promise.all([
    prisma.userSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    }),
    prisma.topic.count({ where: { userId } }),
    prisma.writingStyle.findFirst({ where: { userId, isDefault: true } }),
    prisma.modelConfig.findFirst({ where: { userId, isDefault: true } }),
    getContentStrategy(userId),
  ]);

  const creates: Array<Promise<unknown>> = [];
  if (topicCount === 0) {
    const { DEFAULT_TOPICS } = await import("@/lib/constants");
    creates.push(
      prisma.topic.createMany({
        data: DEFAULT_TOPICS.map((topic) => ({
          userId,
          name: topic.name,
          slug: topic.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          keywords: topic.keywords,
        })),
      }),
    );
  }

  if (!style) {
    creates.push(
      prisma.writingStyle.create({
        data: {
          userId,
          name: DEFAULT_WRITING_STYLE.name,
          isDefault: true,
          systemPrompt: DEFAULT_WRITING_STYLE.systemPrompt,
          rules: DEFAULT_WRITING_STYLE.rules,
          examples: DEFAULT_WRITING_STYLE.examples,
        },
      }),
    );
  }

  if (!model) {
    creates.push(
      prisma.modelConfig.create({
        data: {
          userId,
          name: "DeepSeek Chat",
          provider: "deepseek",
          model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
          baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
          isDefault: true,
        },
      }),
    );
  }

  await Promise.all(creates);

  return { ...settings, contentStrategy };
}

/**
 * Generate exactly ONE post for the next slot that should be ready.
 *
 * - Preps ~50 min before due so the draft is ready *by* slot time (6:00, 7:22, …)
 * - Retries empty due slots on every cron tick until success (no user click)
 * - Only auto-skips slots that are more than one lag behind the live due index
 *
 * Approve/post stays manual. Cron drives generation.
 */
export async function runDueSlotGeneration(options: PipelineOptions): Promise<PipelineResult> {
  const logs: string[] = [];
  const platforms = options.platforms ?? ["x", "linkedin"];
  const useAi = isAiConfigured();
  const now = new Date();
  const pipelineStartedAt = Date.now();
  log(logs, "Pipeline started", options.onLog);

  const [settings] = await Promise.all([
    ensureUserDefaults(options.userId),
    // Clear stuck jobs left when a serverless invocation was killed mid-run.
    prisma.generationJob.updateMany({
      where: {
        userId: options.userId,
        status: { in: ["researching", "writing", "planning", "scoring"] },
        createdAt: { lt: new Date(Date.now() - 8 * 60 * 1000) },
      },
      data: {
        status: "failed",
        error: "Interrupted or timed out — cron will retry this slot",
        completedAt: new Date(),
      },
    }),
  ]);
  const strategy = settings.contentStrategy;
  const plan = buildSlotPlan(
    now,
    settings.timezone,
    settings.firstPostHour,
    settings.lastPostHour,
    settings.postsPerDay,
  );

  // Avoid overlapping cron workers for the same user (double posts / pool thrash)
  if (!options.regenerate && options.slotIndex === undefined) {
    const inflight = await prisma.generationJob.findFirst({
      where: {
        userId: options.userId,
        status: { in: ["researching", "writing", "planning", "scoring"] },
        createdAt: { gte: new Date(Date.now() - 8 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (inflight) {
      log(
        logs,
        `Generation already in progress (job ${inflight.id.slice(0, 8)}…, status=${inflight.status}) — skip this tick`,
        options.onLog,
      );
      return {
        jobId: inflight.id,
        researchRunId: inflight.researchRunId,
        postsCreated: 0,
        sourcesFound: 0,
        logs,
        skipped: true,
        skipReason: "Generation already in progress — next cron tick will continue if needed",
      };
    }
  }

  // Regenerate: clear existing post for the slot, then write a new one with fresh research
  if (options.regenerate) {
    if (options.slotIndex === undefined) {
      return {
        jobId: null,
        researchRunId: null,
        postsCreated: 0,
        sourcesFound: 0,
        logs: ["regenerate requires slotIndex"],
        skipped: true,
        skipReason: "Pick a slot to regenerate",
      };
    }
    const cleared = await clearSlotForRegenerate(
      options.userId,
      options.slotIndex,
      settings.timezone,
    );
    log(
      logs,
      `Regenerate: cleared ${cleared.deleted} post(s) for slot ${options.slotIndex + 1}`,
      options.onLog,
    );
  }

  const filled =
    options.regenerate && options.slotIndex !== undefined
      ? new Set<number>()
      : await getOccupiedSlotIndexes(options.userId, settings.timezone, now);

  let slotIndex: number;
  let scheduledFor: Date;

  if (options.slotIndex !== undefined) {
    if (options.slotIndex < 0 || options.slotIndex >= plan.slots.length) {
      return {
        jobId: null,
        researchRunId: null,
        postsCreated: 0,
        sourcesFound: 0,
        logs: [`Invalid slotIndex ${options.slotIndex}`],
        skipped: true,
        skipReason: `slotIndex must be 0–${plan.slots.length - 1}`,
      };
    }
    if (filled.has(options.slotIndex) && !options.regenerate) {
      log(logs, `Slot ${options.slotIndex + 1}/${plan.postsPerDay} already has a post today — skip`, options.onLog);
      return {
        jobId: null,
        researchRunId: null,
        postsCreated: 0,
        sourcesFound: 0,
        logs,
        skipped: true,
        skipReason: `Slot ${options.slotIndex + 1} already generated today. Use Regenerate to replace it.`,
        slotIndex: options.slotIndex,
      };
    }
    const slotTime = plan.slots[options.slotIndex]!;
    // Regenerate always allowed for existing slots; early only if allowEarly or regenerate
    if (now < slotTime && !options.allowEarly && !options.regenerate) {
      log(
        logs,
        `Slot ${options.slotIndex + 1} is not due yet (due ${formatSlotDateTime(slotTime, plan.timezone)})`,
        options.onLog,
      );
      return {
        jobId: null,
        researchRunId: null,
        postsCreated: 0,
        sourcesFound: 0,
        logs,
        skipped: true,
        skipReason: `Slot not due until ${formatSlotDateTime(slotTime, plan.timezone)}`,
        slotIndex: options.slotIndex,
        scheduledFor: slotTime.toISOString(),
      };
    }
    slotIndex = options.slotIndex;
    scheduledFor = slotTime;
  } else {
    // Cron default: prep early + retry due empties until success
    const pick = pickSlotForGeneration(plan, filled, now);
    if (!pick) {
      // Housekeeping: abandon only slots that are too far behind the live clock
      const stale = listStaleMissedDueSlots(plan, filled);
      for (const missedIdx of stale) {
        try {
          await skipSlot(
            options.userId,
            missedIdx,
            "Missed window — auto-skipped (too far behind live schedule; will not block later slots)",
          );
          filled.add(missedIdx);
          log(logs, `Auto-skipped stale missed slot ${missedIdx + 1}`, options.onLog);
        } catch (err) {
          log(
            logs,
            `Could not auto-skip slot ${missedIdx + 1}: ${err instanceof Error ? err.message : "error"}`,
            options.onLog,
          );
        }
      }

      if (filled.size >= plan.postsPerDay) {
        log(logs, `All ${plan.postsPerDay} slots already filled for today`, options.onLog);
        return {
          jobId: null,
          researchRunId: null,
          postsCreated: 0,
          sourcesFound: 0,
          logs,
          skipped: true,
          skipReason: "All slots already have posts for today",
        };
      }

      const nextLabel = plan.nextUpcomingAt
        ? formatSlotDateTime(plan.nextUpcomingAt, plan.timezone)
        : "tomorrow";
      // Manual allowEarly: draft the next chronological unfilled slot immediately
      if (options.allowEarly) {
        let earlyIndex: number | null = null;
        for (let i = 0; i < plan.slots.length; i++) {
          if (!filled.has(i)) {
            earlyIndex = i;
            break;
          }
        }
        if (earlyIndex !== null) {
          slotIndex = earlyIndex;
          scheduledFor = plan.slots[earlyIndex]!;
          log(
            logs,
            `Manual early mode: preparing slot ${slotIndex + 1} (${formatSlotDateTime(scheduledFor, plan.timezone)})`,
            options.onLog,
          );
        } else {
          return {
            jobId: null,
            researchRunId: null,
            postsCreated: 0,
            sourcesFound: 0,
            logs,
            skipped: true,
            skipReason: "All slots already have posts for today",
          };
        }
      } else {
        log(
          logs,
          `Nothing to generate yet. Next prep window opens before: ${nextLabel}`,
          options.onLog,
        );
        return {
          jobId: null,
          researchRunId: null,
          postsCreated: 0,
          sourcesFound: 0,
          logs,
          skipped: true,
          skipReason: `Nothing to generate yet. Next slot: ${nextLabel} (auto-preps ~50 min before)`,
          slotIndex: plan.nextUpcomingIndex ?? undefined,
          scheduledFor: plan.nextUpcomingAt?.toISOString(),
        };
      }
    } else {
      slotIndex = pick.slotIndex;
      scheduledFor = pick.scheduledFor;
      log(
        logs,
        pick.mode === "prep_early"
          ? `Prep-early: generating slot ${slotIndex + 1} so it is ready by ${formatSlotDateTime(scheduledFor, plan.timezone)}`
          : `Due/retry: slot ${slotIndex + 1} still empty after ${formatSlotDateTime(scheduledFor, plan.timezone)} — generating now (auto, no user click)`,
        options.onLog,
      );

      // Auto-skip only stale empties (too far behind live clock), not the slot we fill
      const staleBefore = listStaleMissedDueSlots(plan, filled).filter((idx) => idx < slotIndex);
      for (const missedIdx of staleBefore) {
        try {
          await skipSlot(
            options.userId,
            missedIdx,
            `Missed window — auto-skipped while generating slot ${slotIndex + 1}`,
          );
          filled.add(missedIdx);
          log(logs, `Auto-skipped stale slot ${missedIdx + 1}`, options.onLog);
        } catch (err) {
          log(
            logs,
            `Could not auto-skip slot ${missedIdx + 1}: ${err instanceof Error ? err.message : "error"}`,
            options.onLog,
          );
        }
      }
    }
  }

  log(
    logs,
    `Slot-based generation: slot ${slotIndex + 1}/${plan.postsPerDay} · ${formatSlotDateTime(scheduledFor, plan.timezone)} · ${plan.timezone}`,
    options.onLog,
  );
  log(logs, "Fresh research for this slot only (not batching all 12)", options.onLog);

  const [topics, style] = await Promise.all([
    prisma.topic.findMany({ where: { userId: options.userId, active: true } }),
    prisma.writingStyle.findFirst({
      where: { userId: options.userId, isDefault: true },
    }),
  ]);

  const job = await prisma.generationJob.create({
    data: {
      user: { connect: { id: options.userId } },
      status: "researching",
      targetCount: 1,
      logsJson: "[]",
      researchRun: {
        create: {
          user: { connect: { id: options.userId } },
          status: "running",
        },
      },
    },
    include: { researchRun: true },
  });
  const researchRun = job.researchRun!;

  try {
    log(
      logs,
      useAi ? "AI mode: DeepSeek configured" : "Demo mode: no DEEPSEEK_API_KEY — template writer",
      options.onLog,
    );
    log(logs, "Manual posting mode: never auto-posting to X/LinkedIn", options.onLog);
    const researchMode = options.researchMode ?? "fast";
    const skipScreenshot =
      options.skipScreenshot ?? researchMode === "fast";
    const contentType = contentTypeForSlot(slotIndex, strategy.contentMix);
    log(
      logs,
      `Collecting sources (${researchMode} mode) · ${describeSourcePolicy(contentType.type)}`,
      options.onLog,
    );

    const rawSources = [
      ...projectSources(strategy),
      ...(await collectAllSources({
        mode: researchMode,
        contentType: contentType.type,
        strategy,
      })),
    ];
    log(
      logs,
      `Fetched ${rawSources.length} raw sources · ${describeSourceMix(rawSources)}`,
      options.onLog,
    );
    if (rawSources.length === 0) {
      throw new Error(
        "Research returned 0 sources within time budget — will retry next cron tick",
      );
    }

    // Persist a diversified feed (not only topic-matched HN/arXiv)
    const fastMode = researchMode === "fast";
    const toStore = diversifySources(rawSources, fastMode ? 32 : 120, fastMode ? 3 : 12);
    log(
      logs,
      `Prepared diversified set: ${toStore.length} · ${describeSourceMix(toStore)}`,
      options.onLog,
    );

    const keywords = topics.flatMap((t) => t.keywords.split(",").map((k) => k.trim())).filter(Boolean);
    // Rank full catalog for writing, but prefer diversity + unused
    const ranked = rankSources(rawSources, keywords);

    // Prefer sources not already used in today's posts; also track providers
    // so we don't ship 12 GitHub-repo posts in a row.
    const { start, end } = dayBoundsUtc(now, settings.timezone);
    const [todayLinks, recentPosts] = await Promise.all([
      prisma.postSource.findMany({
        where: {
          post: {
            userId: options.userId,
            createdAt: { gte: start, lte: end },
            status: { not: "skipped" },
          },
        },
        select: {
          sourceId: true,
          source: { select: { provider: true } },
        },
      }),
      prisma.post.findMany({
        where: { userId: options.userId },
        select: { contentHash: true, hook: true, content: true },
        take: 100,
        orderBy: { createdAt: "desc" },
      }),
    ]);
    const usedSourceIds = new Set(todayLinks.map((r) => r.sourceId));
    const usedProviderCounts = new Map<string, number>();
    for (const link of todayLinks) {
      const p = link.source.provider;
      usedProviderCounts.set(p, (usedProviderCounts.get(p) ?? 0) + 1);
    }
    log(
      logs,
      `Today so far: ${usedSourceIds.size} sources used · providers ${describeProviderCounts(usedProviderCounts)} · max ${MAX_POSTS_PER_PROVIDER_PER_DAY}/provider`,
      options.onLog,
    );

    // Persist a compact union of the diverse feed and strongest writing candidates.
    // Fast generation needs a good choice set, not every raw item in the database.
    const persistCap = fastMode ? 24 : 120;
    const persistMap = new Map<string, RawSourceItem>();
    const rankedHead = ranked.slice(0, fastMode ? 12 : 40);
    for (const item of [...rankedHead, ...toStore, ...ranked]) {
      if (persistMap.size >= persistCap) break;
      persistMap.set(sourceItemKey(item), item);
    }
    const persistStartedAt = Date.now();
    log(logs, `Persisting ${persistMap.size} candidates with 4 workers…`, options.onLog);
    const savedByKey = await upsertResearchSources(
      researchRun.id,
      [...persistMap.values()],
      4,
    );
    log(
      logs,
      `Persisted ${savedByKey.size} candidates in ${((Date.now() - persistStartedAt) / 1000).toFixed(1)}s`,
      options.onLog,
    );

    // Pool: ranked + any stored leftovers not already in ranked list
    const rankedSaved = ranked
      .map((item) => savedByKey.get(sourceItemKey(item)))
      .filter((x): x is { id: string; item: RawSourceItem } => Boolean(x));

    const poolMap = new Map<string, { id: string; item: RawSourceItem }>();
    for (const s of rankedSaved) poolMap.set(s.id, s);
    for (const s of savedByKey.values()) {
      if (!poolMap.has(s.id)) poolMap.set(s.id, s);
    }

    // Slot lane rotation + daily provider quotas (not pure score — GitHub stars used to win every time)
    const ordered = orderCandidatesForStrategy([...poolMap.values()], {
      strategy,
      contentType: contentType.type,
      usedSourceIds,
      usedProviderCounts,
      maxPerProvider: MAX_POSTS_PER_PROVIDER_PER_DAY,
    });

    log(
      logs,
      `Slot ${slotIndex + 1} strategy=${contentType.type} · audience-first top candidates: ${ordered
        .slice(0, 6)
        .map((c) => c.item.provider)
        .join(" → ")}`,
      options.onLog,
    );

    log(
      logs,
      `Research complete: ${savedByKey.size} sources stored · ${ordered.filter((s) => !usedSourceIds.has(s.id)).length} unused candidates today`,
      options.onLog,
    );

    if (ordered.length === 0) {
      throw new Error("No research sources available to write about");
    }

    await Promise.all([
      prisma.researchRun.update({
        where: { id: researchRun.id },
        data: {
          status: "completed",
          sourcesFound: savedByKey.size,
          topicsRanked: JSON.stringify(
            ordered.slice(0, 20).map((source) => ({
              title: source.item.title,
              provider: source.item.provider,
              url: source.item.url,
            })),
          ),
          completedAt: new Date(),
        },
      }),
      prisma.generationJob.update({
        where: { id: job.id },
        data: { status: "writing", logsJson: JSON.stringify(logs) },
      }),
    ]);

    const existingHashes = new Set(recentPosts.map((post) => post.contentHash));
    const recentHooks = recentPosts
      .map((post) => post.hook || post.content.split("\n")[0] || "")
      .filter(Boolean)
      .slice(0, 100);

    const stylePrompt = style?.systemPrompt || DEFAULT_WRITING_STYLE.systemPrompt;
    const rules = style?.rules || DEFAULT_WRITING_STYLE.rules;
    const threshold = settings.qualityThreshold;
    // Every slot pack is dual-format: LinkedIn long-form + X thread (≤280 each)
    void platforms; // reserved for future per-platform toggles
    const angle = contentType.label || pickAngle(slotIndex);
    const strategyPrompt = buildStrategyPrompt(strategy, contentType);
    const engagementBrief = engagementBriefForSlot(slotIndex, contentType);

    let produced = 0;
    let lastError = "";

    // Fast mode: fewer source attempts so we finish inside 60s.
    const maxAttempts = researchMode === "fast" ? Math.min(4, ordered.length) : Math.min(10, ordered.length);

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const picked = ordered[attempt]!;
      const source = picked.item;
      const providerUses = usedProviderCounts.get(source.provider) ?? 0;
      if (
        source.provider !== "project" &&
        providerUses >= MAX_POSTS_PER_PROVIDER_PER_DAY &&
        attempt < ordered.length - 2
      ) {
        log(
          logs,
          `Skip ${source.provider} (already ${providerUses} today, max ${MAX_POSTS_PER_PROVIDER_PER_DAY}) — next candidate`,
          options.onLog,
        );
        continue;
      }

      log(
        logs,
        `Writing dual pack (LinkedIn + X) for slot ${slotIndex + 1} [${source.provider}]: ${source.title.slice(0, 60)}…`,
        options.onLog,
      );

      const candidates: DualDraft[] = useAi
        ? await generateDualWithAi({
            source,
            angle,
            stylePrompt,
            rules: `${rules}\n\n${strategyPrompt}`,
            engagementBrief,
          })
        : [demoDualContent(source, angle)];

      const selected = selectBestDraft(candidates, source.url, engagementBrief, {
        provider: source.provider,
        title: source.title,
        summary: source.summary,
      });
      if (!selected) {
        lastError = "Writer returned no valid candidate packs";
        log(logs, `${lastError} — trying next source…`, options.onLog);
        continue;
      }

      const { draft, audit } = selected;

      log(
        logs,
        `Selected best of ${candidates.length} candidate(s): engagement ${audit.score}/10 · LinkedIn ${draft.linkedIn.length} chars · X ${draft.xThread.length} post(s), max ${Math.max(0, ...draft.xThread.map((t) => t.length))}/${X_CHAR_LIMIT}`,
        options.onLog,
      );
      if (audit.warnings.length) {
        log(logs, `Draft warnings: ${audit.warnings.join("; ")}`, options.onLog);
      }

      if (audit.hardFailures.length && useAi) {
        lastError = audit.hardFailures.join("; ");
        log(logs, `Rejected draft: ${lastError} — trying next source…`, options.onLog);
        continue;
      }

      let scores = scoreDualDraft(draft, audit);
      if (useAi && researchMode === "full") {
        const modelScore = await scoreContent(draft.linkedIn, "linkedin", true);
        scores = blendQualityScores(scores, modelScore);
      }

      const engagementFloor = researchMode === "fast" ? 5.8 : 6.5;
      if (audit.score < engagementFloor && useAi) {
        lastError = `Low engagement score ${audit.score}`;
        log(logs, `Rejected draft (${audit.score}), trying next source…`, options.onLog);
        continue;
      }

      const rejectFloor = researchMode === "fast" ? threshold - 3 : threshold - 1.5;
      if (scores.overall < rejectFloor && useAi) {
        lastError = `Low quality score ${scores.overall}`;
        log(logs, `Rejected draft (${scores.overall}), trying next source…`, options.onLog);
        continue;
      }

      const hookSimilarity = maxTextSimilarity(draft.hook, recentHooks);
      if (hookSimilarity > 0.72 && useAi) {
        lastError = `Repetitive hook (${Math.round(hookSimilarity * 100)}% similar)`;
        log(logs, `${lastError} — trying next source…`, options.onLog);
        continue;
      }

      const hash = contentHash(`${draft.linkedIn}\n---\n${draft.xThread.join("\n")}`);
      if (existingHashes.has(hash)) {
        lastError = "Duplicate content";
        log(logs, "Duplicate content hash — trying next source…", options.onLog);
        continue;
      }

      const topicMatch = topics.find((t) =>
        t.keywords
          .toLowerCase()
          .split(",")
          .some(
            (k) =>
              k.trim() &&
              `${source.title} ${source.summary || ""}`.toLowerCase().includes(k.trim()),
          ),
      );

      // Screenshots can take 20–40s alone — skip on fast/cron so writing finishes under 60s
      const imageDecision = shouldIncludeImage({
        platform: "both",
        angle,
        provider: source.provider,
        title: source.title,
        url: source.url,
      });

      let imagePath: string | null = null;
      let imageSourceUrl: string | null = null;
      let imageCaption: string | null = null;
      let imageSkipReason: string | null = imageDecision.reason;

      if (skipScreenshot) {
        imageSkipReason =
          "Screenshot deferred on fast cron path (use Recapture on post page if needed)";
        log(logs, imageSkipReason, options.onLog);
      } else if (imageDecision.needsImage) {
        log(logs, `Screenshot for chosen source: ${source.url.slice(0, 90)}…`, options.onLog);
        const shot = await capturePageScreenshot(source.url, {
          filename: `${Date.now()}-slot${slotIndex}.png`,
        });
        if (shot.ok && shot.publicPath) {
          imagePath = shot.publicPath;
          imageSourceUrl = source.url;
          imageCaption = `Screenshot of: ${source.title.slice(0, 120)}`;
          imageSkipReason = null;
          log(logs, `Screenshot saved → ${shot.publicPath}`, options.onLog);
        } else {
          imageSkipReason = shot.error || imageDecision.reason;
          log(logs, `Screenshot failed (post still saved): ${imageSkipReason}`, options.onLog);
        }
      } else {
        log(logs, `No screenshot: ${imageDecision.reason}`, options.onLog);
      }

      await prisma.$transaction([
        prisma.post.create({
          data: {
          userId: options.userId,
          platform: "both",
          format: draft.xThread.length > 1 ? "dual-thread" : "dual",
          title: draft.title,
          content: draft.linkedIn,
          contentLinkedIn: draft.linkedIn,
          threadJson: JSON.stringify(draft.xThread),
          status: "pending_review",
          contentHash: hash,
          topicId: topicMatch?.id,
          writingStyleId: style?.id,
          researchRunId: researchRun.id,
          angle,
          hook: draft.hook,
          needsImage: imageDecision.needsImage,
          imagePath,
          imageSourceUrl,
          imageCaption,
          imageSkipReason,
          scoreNovelty: scores.novelty,
          scoreAccuracy: scores.accuracy,
          scoreHook: scores.hook,
          scoreReadability: scores.readability,
          scoreVirality: scores.virality,
          scoreTechnical: scores.technical,
          scoreEngagement: scores.engagement,
          scoreOverall: scores.overall,
          citationsJson: JSON.stringify([
            { title: source.title, url: source.url, provider: source.provider },
          ]),
          schedule: {
            create: {
              scheduledFor,
              slotIndex,
              status: "pending",
            },
          },
          readinessJobs: {
            create: {
              platform: "both",
              status: "awaiting_approval",
            },
          },
          sources: {
            create: [{ sourceId: picked.id }],
          },
          },
        }),
        prisma.generationJob.update({
          where: { id: job.id },
          data: {
            status: "completed",
            producedCount: 1,
            logsJson: JSON.stringify(logs),
            completedAt: new Date(),
          },
        }),
      ]);

      produced = 1;
      break;
    }

    if (produced === 0) {
      throw new Error(lastError || "Could not produce a quality post for this slot");
    }

    log(
      logs,
      `Done in ${((Date.now() - pipelineStartedAt) / 1000).toFixed(1)}s: 1 post for slot ${slotIndex + 1}/${plan.postsPerDay}. Review → approve → post manually. Next slot will re-research live trends.`,
      options.onLog,
    );

    return {
      jobId: job.id,
      researchRunId: researchRun.id,
      postsCreated: 1,
      sourcesFound: savedByKey.size,
      logs,
      slotIndex,
      scheduledFor: scheduledFor.toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown pipeline error";
    log(logs, `FAILED: ${message}`, options.onLog);
    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: "failed",
        error: message,
        logsJson: JSON.stringify(logs),
        completedAt: new Date(),
      },
    });
    await prisma.researchRun.update({
      where: { id: researchRun.id },
      data: { status: "failed", error: message, completedAt: new Date() },
    });
    throw err;
  }
}

/** @deprecated Use runDueSlotGeneration — batch-of-12 is intentionally disabled. */
export async function runGenerationPipeline(options: PipelineOptions): Promise<PipelineResult> {
  return runDueSlotGeneration(options);
}

/**
 * Cron entry: for each user, prep or retry at most one slot post.
 * Failures are not fatal — the next 15‑min tick retries the same empty slot.
 */
export async function runCronForAllUsers(): Promise<{
  users: number;
  created: number;
  results: Array<{ userId: string; postsCreated: number; skipReason?: string }>;
}> {
  const users = await prisma.user.findMany({ select: { id: true } });
  const results: Array<{ userId: string; postsCreated: number; skipReason?: string }> = [];
  let created = 0;

  for (const user of users) {
    try {
      // Fast research + no screenshot — must fit Vercel Hobby 60s
      const r = await runDueSlotGeneration({
        userId: user.id,
        researchMode: "fast",
        skipScreenshot: true,
      });
      created += r.postsCreated;
      results.push({
        userId: user.id,
        postsCreated: r.postsCreated,
        skipReason: r.skipReason,
      });
      if (r.postsCreated === 0 && r.skipReason) {
        console.log(`[cron] user=${user.id.slice(0, 8)}… skip: ${r.skipReason}`);
      } else if (r.postsCreated > 0) {
        console.log(
          `[cron] user=${user.id.slice(0, 8)}… created slot ${(r.slotIndex ?? 0) + 1}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      console.error(`[cron] user=${user.id.slice(0, 8)}… failed: ${msg}`);
      results.push({
        userId: user.id,
        postsCreated: 0,
        skipReason: msg,
      });
      // Leave slot empty — next tick retries automatically
    }
  }

  return { users: users.length, created, results };
}

export function fingerprint(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 12);
}
