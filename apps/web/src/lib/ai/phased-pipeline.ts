/**
 * Multi-phase generation for Vercel Hobby (60s max per invocation).
 *
 * Tick N:   research chunk N  → persist sources → return (chain next)
 * Tick last: write dual post from accumulated sources → complete
 *
 * External cron every 15 min starts a chain; each worker may self-dispatch
 * the next phase so a full slot finishes in ~1–2 minutes of chained workers,
 * not 4×15 minutes of waiting.
 */

import { prisma } from "@/lib/db";
import { DEFAULT_WRITING_STYLE } from "@/lib/constants";
import { contentHash } from "@/lib/hash";
import { isAiConfigured, chatCompletion } from "@/lib/ai/client";
import { ANGLES } from "@/lib/ai/prompts";
import { scoreDualDraft } from "@/lib/ai/scoring";
import {
  buildSlotPlan,
  dayBoundsUtc,
  formatSlotDateTime,
  listStaleMissedDueSlots,
  pickSlotForGeneration,
} from "@/lib/schedule/slots";
import { getOccupiedSlotIndexes, skipSlot } from "@/lib/schedule/slot-actions";
import {
  MAX_POSTS_PER_PROVIDER_PER_DAY,
  describeProviderCounts,
} from "@/lib/research/diversity";
import {
  collectResearchChunk,
  researchChunkCount,
  researchChunksForContentType,
} from "@/lib/research/chunks";
import type { RawSourceItem } from "@/lib/integrations/types";
import {
  enforceXLimit,
  splitIntoXChunks,
  X_CHAR_LIMIT,
} from "@/lib/content/platforms";
import { ensureUserDefaults } from "@/lib/ai/pipeline";
import {
  buildStrategyPrompt,
  contentTypeForSlot,
  orderCandidatesForStrategy,
  type ContentType,
} from "@/lib/content/strategy";
import { markProjectFactUsed, projectSourcesForUser } from "@/lib/projects/fact-sources";
import {
  buildEngagementPrompt,
  engagementBriefForSlot,
  maxTextSimilarity,
  parseDraftCandidates,
  selectBestDraft,
  type DualDraft,
  type EngagementBrief,
} from "@/lib/content/engagement";
import { upsertResearchSources } from "@/lib/research/source-store";
import { filterSourcesForContentType } from "@/lib/research/source-policy";
import {
  buildGenerationSnapshot,
  recommendedMediaTypeForContent,
  resolveGenerationLearning,
} from "@/lib/experiments/service";
import {
  completeOperationalRun,
  failOperationalRun,
  recordOperationalEvent,
  startOperationalRun,
  type OperationSource,
} from "@/lib/operations/store";
import {
  executionContentItem,
  executionContentItemForType,
  linkExecutionDirective,
  resolveExecutionDirective,
} from "@/lib/execution-plan/service";

export interface PhaseResult {
  jobId: string | null;
  researchRunId: string | null;
  postsCreated: number;
  sourcesFound: number;
  logs: string[];
  skipped?: boolean;
  skipReason?: string;
  slotIndex?: number;
  scheduledFor?: string;
  /** True when more phases remain — cron should self-chain another worker. */
  continueChain?: boolean;
  phase?: string;
  operationRunId?: string;
}

export interface PhasedJobMeta {
  kind: "phased_v1";
  slotIndex: number;
  scheduledFor: string;
  nextChunkIndex: number;
  totalChunks: number;
  generationJobId: string;
  /** Optional only for compatibility with jobs created before product-first research. */
  contentType?: ContentType;
  executionPlanItemId?: string;
}

function log(logs: string[], message: string) {
  logs.push(`[${new Date().toISOString()}] ${message}`);
  console.log(`[phased] ${message}`);
}

function parseMeta(raw: string | null | undefined): PhasedJobMeta | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as PhasedJobMeta;
    if (data?.kind === "phased_v1") return data;
  } catch {
    /* ignore */
  }
  return null;
}

function parseRawJson(raw: string | null): unknown {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

async function appendJobLogs(jobId: string, logs: string[], existingJson?: string | null) {
  let prev: string[] = [];
  try {
    prev = existingJson ? (JSON.parse(existingJson) as string[]) : [];
    if (!Array.isArray(prev)) prev = [];
  } catch {
    prev = [];
  }
  const merged = [...prev, ...logs].slice(-200);
  await prisma.generationJob.update({
    where: { id: jobId },
    data: { logsJson: JSON.stringify(merged) },
  });
  return merged;
}

async function persistSources(
  researchRunId: string,
  items: RawSourceItem[],
): Promise<number> {
  return (await upsertResearchSources(researchRunId, items, 4)).size;
}

/**
 * One phase per invocation:
 * - start or resume a phased job for the next prep/due slot
 * - run exactly one research chunk OR the write step
 */
export async function runOneGenerationPhase(userId: string): Promise<PhaseResult> {
  const logs: string[] = [];
  const now = new Date();
  const settings = await ensureUserDefaults(userId);
  const strategy = settings.contentStrategy;
  const plan = buildSlotPlan(
    now,
    settings.timezone,
    settings.firstPostHour,
    settings.lastPostHour,
    settings.postsPerDay,
  );
  const { start, end } = dayBoundsUtc(now, settings.timezone);

  // Mark stuck jobs failed only after >2 external cron intervals (so a write
  // waiting for the next 15‑min tick is not killed as "stuck").
  await prisma.generationJob.updateMany({
    where: {
      userId,
      status: { in: ["research", "researching", "write", "writing"] },
      updatedAt: { lt: new Date(Date.now() - 35 * 60 * 1000) },
    },
    data: {
      status: "failed",
      error: "Phase stalled >35 min — starting fresh on next due tick",
      completedAt: new Date(),
    },
  });

  // Resume in-progress phased job
  const openJob = await prisma.generationJob.findFirst({
    where: {
      userId,
      status: { in: ["research", "researching", "write", "writing"] },
      createdAt: { gte: start, lte: end },
    },
    orderBy: { createdAt: "desc" },
    include: { researchRun: true },
  });

  if (openJob?.researchRunId) {
    const meta = parseMeta(openJob.researchRun?.topicsRanked);
    if (meta && meta.generationJobId === openJob.id) {
      const contentType =
        meta.contentType ??
        contentTypeForSlot(meta.slotIndex, strategy.contentMix).type;
      const normalizedMeta: PhasedJobMeta = {
        ...meta,
        contentType,
        totalChunks: researchChunkCount(contentType),
        nextChunkIndex: Math.min(
          meta.nextChunkIndex,
          researchChunkCount(contentType),
        ),
      };
      if (!meta.contentType || meta.totalChunks !== normalizedMeta.totalChunks) {
        await prisma.researchRun.update({
          where: { id: openJob.researchRunId },
          data: { topicsRanked: JSON.stringify(normalizedMeta) },
        });
      }
      if (openJob.status === "write" || openJob.status === "writing") {
        return runWritePhase(userId, openJob.id, openJob.researchRunId, normalizedMeta, logs);
      }
      return runResearchChunkPhase(
        userId,
        openJob.id,
        openJob.researchRunId,
        normalizedMeta,
        logs,
      );
    }
  }

  // Start a new phased job for the next slot that needs a post
  const filled = await getOccupiedSlotIndexes(userId, settings.timezone, now);

  // Housekeeping: stale misses
  for (const missedIdx of listStaleMissedDueSlots(plan, filled)) {
    try {
      await skipSlot(
        userId,
        missedIdx,
        "Missed window — auto-skipped (too far behind live schedule)",
      );
      filled.add(missedIdx);
      log(logs, `Auto-skipped stale slot ${missedIdx + 1}`);
    } catch {
      /* ignore */
    }
  }

  const pick = pickSlotForGeneration(plan, filled, now);
  if (!pick) {
    const nextLabel = plan.nextUpcomingAt
      ? formatSlotDateTime(plan.nextUpcomingAt, plan.timezone)
      : "tomorrow";
    log(logs, `Nothing to generate. Next prep window before ${nextLabel}`);
    return {
      jobId: null,
      researchRunId: null,
      postsCreated: 0,
      sourcesFound: 0,
      logs,
      skipped: true,
      skipReason: `Nothing to generate yet. Next slot: ${nextLabel}`,
      continueChain: false,
    };
  }

  const executionDirective = await resolveExecutionDirective(userId, pick.scheduledFor, pick.slotIndex);
  const researchRun = await prisma.researchRun.create({
    data: { userId, status: "running" },
  });

  const ownedProjectSources = await persistSources(
    researchRun.id,
    await projectSourcesForUser(userId, strategy),
  );

  const job = await prisma.generationJob.create({
    data: {
      userId,
      researchRunId: researchRun.id,
      status: "research",
      targetCount: 1,
      producedCount: 0,
      logsJson: "[]",
    },
  });

  const contentType = executionContentItem(executionDirective, strategy, pick.slotIndex).type;
  const meta: PhasedJobMeta = {
    kind: "phased_v1",
    slotIndex: pick.slotIndex,
    scheduledFor: pick.scheduledFor.toISOString(),
    nextChunkIndex: 0,
    totalChunks: researchChunkCount(contentType),
    generationJobId: job.id,
    contentType,
    executionPlanItemId: executionDirective?.id,
  };

  await prisma.researchRun.update({
    where: { id: researchRun.id },
    data: {
      topicsRanked: JSON.stringify(meta),
      sourcesFound: ownedProjectSources,
    },
  });

  log(
    logs,
    `Started phased job for slot ${pick.slotIndex + 1} · ${formatSlotDateTime(pick.scheduledFor, plan.timezone)} · mode=${pick.mode} · strategy=${contentType}${executionDirective ? ` · approved weekly anchor=${executionDirective.projectName || executionDirective.contentType}` : ""} · ${ownedProjectSources} owned projects + ${meta.totalChunks} targeted research chunks + 1 write`,
  );
  await appendJobLogs(job.id, logs);

  return runResearchChunkPhase(userId, job.id, researchRun.id, meta, []);
}

async function runResearchChunkPhase(
  userId: string,
  jobId: string,
  researchRunId: string,
  meta: PhasedJobMeta,
  seedLogs: string[],
): Promise<PhaseResult> {
  const logs = [...seedLogs];
  const chunkIndex = meta.nextChunkIndex;
  const settings = await ensureUserDefaults(userId);
  const strategy = settings.contentStrategy;
  const contentType =
    meta.contentType ??
    contentTypeForSlot(meta.slotIndex, strategy.contentMix).type;
  const researchPlan = researchChunksForContentType(contentType);

  if (chunkIndex >= researchPlan.length) {
    // All research done → move to write
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: "write" },
    });
    log(logs, "All research chunks complete → entering write phase");
    await appendJobLogs(jobId, logs);
    return runWritePhase(userId, jobId, researchRunId, meta, []);
  }

  const def = researchPlan[chunkIndex]!;
  log(
    logs,
    `Research chunk ${chunkIndex + 1}/${meta.totalChunks}: ${def.label} (${def.id})…`,
  );

  try {
    const { items, mix } = await collectResearchChunk(
      chunkIndex,
      contentType,
      strategy,
    );
    const stored = await persistSources(researchRunId, items);

    const run = await prisma.researchRun.findUnique({ where: { id: researchRunId } });
    const sourcesFound = (run?.sourcesFound ?? 0) + stored;

    const nextMeta: PhasedJobMeta = {
      ...meta,
      nextChunkIndex: chunkIndex + 1,
      totalChunks: researchPlan.length,
      contentType,
    };

    await prisma.researchRun.update({
      where: { id: researchRunId },
      data: {
        sourcesFound,
        topicsRanked: JSON.stringify(nextMeta),
        status: "running",
      },
    });

    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: nextMeta.nextChunkIndex >= nextMeta.totalChunks ? "write" : "research",
      },
    });

    log(logs, `Chunk ${def.id} done: +${stored} sources (${mix || "empty"}) · total stored≈${sourcesFound}`);
    await appendJobLogs(jobId, logs);

    const moreResearch = nextMeta.nextChunkIndex < nextMeta.totalChunks;
    return {
      jobId,
      researchRunId,
      postsCreated: 0,
      sourcesFound,
      logs,
      slotIndex: meta.slotIndex,
      scheduledFor: meta.scheduledFor,
      continueChain: true, // always chain: either more research or write
      phase: moreResearch
        ? `research:${nextMeta.nextChunkIndex}/${nextMeta.totalChunks}`
        : "write",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Research chunk failed";
    log(logs, `FAILED chunk ${def.id}: ${message}`);
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: message,
        completedAt: new Date(),
      },
    });
    await appendJobLogs(jobId, logs);
    // Don't chain; next external cron will start fresh or retry slot
    return {
      jobId,
      researchRunId,
      postsCreated: 0,
      sourcesFound: 0,
      logs,
      skipped: true,
      skipReason: message,
      continueChain: false,
      phase: `research_failed:${def.id}`,
    };
  }
}

async function runWritePhase(
  userId: string,
  jobId: string,
  researchRunId: string,
  meta: PhasedJobMeta,
  seedLogs: string[],
): Promise<PhaseResult> {
  const logs = [...seedLogs];
  const useAi = isAiConfigured();
  const now = new Date();
  const settings = await ensureUserDefaults(userId);
  const strategy = settings.contentStrategy;
  const plan = buildSlotPlan(
    now,
    settings.timezone,
    settings.firstPostHour,
    settings.lastPostHour,
    settings.postsPerDay,
  );

  const slotIndex = meta.slotIndex;
  const scheduledFor = new Date(meta.scheduledFor);
  const executionDirective = await resolveExecutionDirective(userId, scheduledFor, slotIndex);

  log(
    logs,
    `Write phase: slot ${slotIndex + 1} · ${formatSlotDateTime(scheduledFor, plan.timezone)} · AI=${useAi}`,
  );

  await prisma.generationJob.update({
    where: { id: jobId },
    data: { status: "writing" },
  });

  try {
    // Load all sources gathered across chunks for this research run
    const dbSources = await prisma.source.findMany({
      where: { researchRunId },
      orderBy: { score: "desc" },
      take: 150,
    });

    if (dbSources.length === 0) {
      throw new Error("No sources stored for this research run — cannot write");
    }

    log(logs, `Loaded ${dbSources.length} sources from research run for ranking`);

    const topics = await prisma.topic.findMany({ where: { userId, active: true } });
    const style =
      (await prisma.writingStyle.findFirst({
        where: { userId, isDefault: true },
      })) || null;

    const keywords = topics
      .flatMap((t) => t.keywords.split(",").map((k) => k.trim()))
      .filter(Boolean);

    const contentType = executionContentItemForType(meta.contentType, strategy, slotIndex);
    const asRaw: RawSourceItem[] = filterSourcesForContentType(
      dbSources.map((s) => ({
        provider: s.provider as RawSourceItem["provider"],
        externalId: s.externalId,
        title: s.title,
        url: s.url,
        summary: s.summary ?? undefined,
        score: s.score,
        raw: parseRawJson(s.rawJson),
      })),
      contentType.type,
      strategy,
    );

    // Topic boost
    const ranked = [...asRaw]
      .map((s) => {
        const hay = `${s.title} ${s.summary || ""}`.toLowerCase();
        const topicBoost = keywords.some((k) => hay.includes(k.toLowerCase())) ? 30 : 0;
        return { s, rank: (s.score ?? 0) + topicBoost };
      })
      .sort((a, b) => b.rank - a.rank)
      .map((x) => x.s);

    const { start, end } = dayBoundsUtc(now, settings.timezone);
    const todayLinks = await prisma.postSource.findMany({
      where: {
        post: {
          userId,
          createdAt: { gte: start, lte: end },
          status: { not: "skipped" },
        },
      },
      select: {
        sourceId: true,
        source: { select: { provider: true } },
      },
    });
    const usedSourceIds = new Set(todayLinks.map((r) => r.sourceId));
    const usedProviderCounts = new Map<string, number>();
    for (const link of todayLinks) {
      const p = link.source.provider;
      usedProviderCounts.set(p, (usedProviderCounts.get(p) ?? 0) + 1);
    }
    log(
      logs,
      `Today providers: ${describeProviderCounts(usedProviderCounts)} · max ${MAX_POSTS_PER_PROVIDER_PER_DAY}/provider`,
    );

    const idByKey = new Map(dbSources.map((s) => [`${s.provider}:${s.externalId}`, s.id]));
    const candidates = ranked
      .map((item) => {
        const id = idByKey.get(`${item.provider}:${item.externalId}`);
        if (!id) return null;
        return { id, item };
      })
      .filter((x): x is { id: string; item: RawSourceItem } => Boolean(x));

    let ordered = orderCandidatesForStrategy(candidates, {
      strategy,
      contentType: contentType.type,
      usedSourceIds,
      usedProviderCounts,
      maxPerProvider: MAX_POSTS_PER_PROVIDER_PER_DAY,
    });
    if (executionDirective?.projectId) {
      ordered = [...ordered].sort((a, b) => {
        const aMatch = a.item.provider === "project" && a.item.externalId.includes(`:${executionDirective.projectId}:`);
        const bMatch = b.item.provider === "project" && b.item.externalId.includes(`:${executionDirective.projectId}:`);
        return Number(bMatch) - Number(aMatch);
      });
    }

    log(
      logs,
      `Strategy type=${contentType.type} · audience-first top=${ordered
        .slice(0, 5)
        .map((c) => c.item.provider)
        .join("→")}`,
    );

    const recentPosts = await prisma.post.findMany({
      where: { userId },
      select: { contentHash: true, hook: true, content: true },
      take: 500,
      orderBy: { createdAt: "desc" },
    });
    const existingHashes = new Set(recentPosts.map((post) => post.contentHash));
    const recentHooks = recentPosts
      .map((post) => post.hook || post.content.split("\n")[0] || "")
      .filter(Boolean)
      .slice(0, 100);

    const stylePrompt = style?.systemPrompt || DEFAULT_WRITING_STYLE.systemPrompt;
    const rules = style?.rules || DEFAULT_WRITING_STYLE.rules;
    const threshold = settings.qualityThreshold;
    const angle = executionDirective?.angle || contentType.label || ANGLES[slotIndex % ANGLES.length]!;
    const strategyPrompt = buildStrategyPrompt(strategy, contentType);
    const baseEngagementBrief = engagementBriefForSlot(slotIndex, contentType);
    const learning = await resolveGenerationLearning(userId, slotIndex, baseEngagementBrief);
    const engagementBrief = learning.brief;
    const recommendedMediaByPlatform = recommendedMediaTypeForContent(contentType, learning);
    if (executionDirective?.mediaType === "carousel") {
      recommendedMediaByPlatform.x = "branded_visual";
      recommendedMediaByPlatform.linkedin = "carousel";
    } else if (executionDirective?.mediaType === "branded_visual") {
      recommendedMediaByPlatform.x = "branded_visual";
      recommendedMediaByPlatform.linkedin = "branded_visual";
    }
    if (learning.experiment) {
      log(
        logs,
        `Experiment ${learning.experiment.name}: ${learning.experiment.variantLabel} for ${learning.experiment.platform.toUpperCase()}`,
      );
    } else if (learning.appliedRecommendations.length) {
      log(logs, `Applied ${learning.appliedRecommendations.length} approved growth preference(s)`);
    }

    let produced = 0;
    let lastError = "";

    for (let attempt = 0; attempt < Math.min(5, ordered.length); attempt++) {
      const picked = ordered[attempt]!;
      const source = picked.item;
      const providerUses = usedProviderCounts.get(source.provider) ?? 0;
      if (
        source.provider !== "project" &&
        providerUses >= MAX_POSTS_PER_PROVIDER_PER_DAY &&
        attempt < ordered.length - 2
      ) {
        log(logs, `Skip ${source.provider} (quota)`);
        continue;
      }

      log(logs, `Writing from [${source.provider}] ${source.title.slice(0, 70)}…`);

      const candidates: DualDraft[] = useAi
        ? await writeDual(source, angle, stylePrompt, rules, strategyPrompt, engagementBrief)
        : [demoDual(source, angle)];

      const selected = selectBestDraft(candidates, source.url, engagementBrief, {
        provider: source.provider,
        title: source.title,
        summary: source.summary,
      }, { recentHooks });
      if (!selected) {
        lastError = "Writer returned no valid candidate packs";
        log(logs, `${lastError}, next source…`);
        continue;
      }

      const { draft, audit } = selected;

      log(logs, `Selected best of ${candidates.length} candidate(s), engagement ${audit.score}/10`);
      if (audit.warnings.length) log(logs, `Draft warnings: ${audit.warnings.join("; ")}`);

      if (audit.hardFailures.length && useAi) {
        lastError = audit.hardFailures.join("; ");
        log(logs, `Reject draft: ${lastError}, next source…`);
        continue;
      }

      const scores = scoreDualDraft(draft, audit);

      if ((audit.score < 5.8 || scores.overall < threshold - 3) && useAi) {
        lastError = `Low quality: engagement ${audit.score}, overall ${scores.overall}`;
        log(logs, `Reject ${lastError}, next source…`);
        continue;
      }

      const hookSimilarity = maxTextSimilarity(draft.hook, recentHooks);
      if (hookSimilarity > 0.72 && useAi) {
        lastError = `Repetitive hook (${Math.round(hookSimilarity * 100)}% similar)`;
        log(logs, `Reject ${lastError}, next source…`);
        continue;
      }

      const hash = contentHash(`${draft.linkedIn}\n---\n${draft.xThread.join("\n")}`);
      if (existingHashes.has(hash)) {
        lastError = "Duplicate";
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

      const createdPost = await prisma.post.create({
        data: {
          userId,
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
          researchRunId,
          angle,
          contentType: contentType.type,
          hook: draft.hook,
          experimentVariantId: learning.experimentVariantId,
          recommendedMediaType:
            recommendedMediaByPlatform.x === recommendedMediaByPlatform.linkedin
              ? recommendedMediaByPlatform.x
              : "mixed",
          recommendedMediaTypeX: recommendedMediaByPlatform.x,
          recommendedMediaTypeLinkedIn: recommendedMediaByPlatform.linkedin,
          generationSnapshotJson: buildGenerationSnapshot({
            slotIndex,
            scheduledFor,
            contentType,
            brief: engagementBrief,
            strategy,
            source,
            learning,
            recommendedMediaByPlatform,
          }),
          needsImage: false,
          imageSkipReason: "Screenshot deferred — use Recapture on the post page",
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
            create: { platform: "both", status: "awaiting_approval" },
          },
          sources: {
            create: [{ sourceId: picked.id }],
          },
        },
      });
      await linkExecutionDirective(meta.executionPlanItemId ?? executionDirective?.id, createdPost.id);
      await markProjectFactUsed(source);

      produced = 1;
      log(
        logs,
        `Post created for slot ${slotIndex + 1} (score ${scores.overall}). Approve & post manually.`,
      );
      break;
    }

    if (produced === 0) {
      throw new Error(lastError || "Could not produce a post from gathered sources");
    }

    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "completed",
        producedCount: 1,
        completedAt: new Date(),
      },
    });
    await prisma.researchRun.update({
      where: { id: researchRunId },
      data: { status: "completed", completedAt: new Date() },
    });
    await appendJobLogs(jobId, logs);

    return {
      jobId,
      researchRunId,
      postsCreated: 1,
      sourcesFound: dbSources.length,
      logs,
      slotIndex,
      scheduledFor: meta.scheduledFor,
      continueChain: false,
      phase: "completed",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Write phase failed";
    log(logs, `FAILED write: ${message}`);
    await prisma.generationJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: message,
        completedAt: new Date(),
      },
    });
    await prisma.researchRun.update({
      where: { id: researchRunId },
      data: { status: "failed", error: message, completedAt: new Date() },
    });
    await appendJobLogs(jobId, logs);
    return {
      jobId,
      researchRunId,
      postsCreated: 0,
      sourcesFound: 0,
      logs,
      skipped: true,
      skipReason: message,
      continueChain: false,
      phase: "write_failed",
      slotIndex: meta.slotIndex,
      scheduledFor: meta.scheduledFor,
    };
  }
}

function demoDual(source: RawSourceItem, angle: string) {
  const hook = source.title.slice(0, 80);
  const summary = source.summary?.slice(0, 400) || "Fresh signal from the engineering feed.";
  const linkedIn = `${hook}

${summary}

Why it matters (${angle}):
- Grounded in a real ${source.provider} source
- Worth tracking if you ship production systems

Read more: ${source.url}

#engineering #software #ai`;
  const xBody = `${hook}

${angle} — from ${source.provider}.

${source.url}`;
  return {
    title: hook,
    hook,
    linkedIn,
    xThread: enforceXLimit(splitIntoXChunks(xBody, X_CHAR_LIMIT)),
  };
}

async function writeDual(
  source: RawSourceItem,
  angle: string,
  stylePrompt: string,
  rules: string,
  strategyPrompt: string,
  engagementBrief: EngagementBrief,
): Promise<DualDraft[]> {
  const user = `Turn ONE source into platform-native social content.

Angle: ${angle}
Source title: ${source.title}
Source url: ${source.url}
Source summary: ${source.summary || "n/a"}
Provider: ${source.provider}

Content strategy:
${strategyPrompt}

Match the source type (project→owned-project lesson using only supplied facts, github/official RSS→architecture or discovery, arxiv/Hugging Face→selective research, HN/Reddit→evidence-backed opinion only).

Rules:
${rules}

${buildEngagementPrompt(engagementBrief)}`;

  const raw = await chatCompletion({
    system:
      stylePrompt +
      "\n\nProduce factual, ready-to-paste LinkedIn and X copy. Follow the JSON schema exactly.",
    user,
    temperature: 0.82,
    maxTokens: 3200,
    json: true,
  });
  return parseDraftCandidates(raw, source.title);
}

/** Minimum ms we must have left before starting the next phase. */
async function minMsForNextPhase(userId: string): Promise<number> {
  const settings =
    (await prisma.userSettings.findUnique({ where: { userId } })) ||
    (await ensureUserDefaults(userId));
  const { start, end } = dayBoundsUtc(new Date(), settings.timezone);
  const open = await prisma.generationJob.findFirst({
    where: {
      userId,
      status: { in: ["research", "researching", "write", "writing"] },
      createdAt: { gte: start, lte: end },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!open) return 14_000; // start job + first research chunk
  if (open.status === "write" || open.status === "writing") return 22_000; // LLM write
  return 12_000; // one research chunk
}

/**
 * Run as many phases as fit in `budgetMs` for one user (no HTTP self-calls).
 * Vercel blocks same-URL worker chains with 508 Infinite loop — so we pack
 * chunks into one invocation and let the *next external cron* continue if needed.
 */
export async function runPhasesWithBudget(
  userId: string,
  budgetMs = 52_000,
  context: {
    source?: OperationSource;
    retryOfId?: string;
    operation?: { id: string; startedAt: Date };
  } = {},
): Promise<PhaseResult> {
  const operation = context.operation ?? await startOperationalRun({
      userId,
      kind: "generation",
      source: context.source ?? "system",
      stage: "generation",
      retryOfId: context.retryOfId,
      metadata: { budgetMs },
    });
  const t0 = Date.now();
  const allLogs: string[] = [];
  let last: PhaseResult = {
    jobId: null,
    researchRunId: null,
    postsCreated: 0,
    sourcesFound: 0,
    logs: [],
    continueChain: false,
  };
  let postsCreated = 0;
  let phasesRun = 0;

  const finish = async (result: PhaseResult): Promise<PhaseResult> => {
    const stage = result.continueChain ? "checkpoint_saved" : result.phase ?? "completed";
    if (result.jobId) {
      await prisma.operationalRun.update({
        where: { id: operation.id },
        data: { subjectType: "generation_job", subjectId: result.jobId },
      });
    }
    await completeOperationalRun(operation.id, {
      stage,
      message: result.continueChain
        ? "Invocation ended safely; the next cron tick will resume the persisted checkpoint."
        : result.postsCreated
          ? `${result.postsCreated} post pack created.`
          : result.skipReason || "No generation work was due.",
      metadata: {
        jobId: result.jobId,
        phase: result.phase,
        postsCreated: result.postsCreated,
        sourcesFound: result.sourcesFound,
      },
    });
    return { ...result, operationRunId: operation.id };
  };

  try {
    while (Date.now() - t0 < budgetMs) {
      const remaining = budgetMs - (Date.now() - t0);
      const need = await minMsForNextPhase(userId);
      if (remaining < need) {
        log(
          allLogs,
          `Budget pause: ${Math.round(remaining / 1000)}s left, need ~${Math.round(need / 1000)}s for next phase — next external cron will continue`,
        );
        last = {
          ...last,
          continueChain: true,
          skipReason: `Paused for next cron tick (${phasesRun} phase(s) this run)`,
          logs: allLogs,
        };
        break;
      }

      const phaseStarted = Date.now();
      const r = await runOneGenerationPhase(userId);
      const phaseName = r.phase ?? (r.skipped ? "idle" : "generation");
      await recordOperationalEvent(operation.id, {
        stage: phaseName,
        level: r.skipReason && !r.continueChain && !r.skipped ? "warning" : "info",
        message: r.postsCreated
          ? `Phase completed and created ${r.postsCreated} post pack.`
          : r.skipReason || `Phase ${phaseName} completed.`,
        durationMs: Date.now() - phaseStarted,
        metadata: {
          jobId: r.jobId,
          sourcesFound: r.sourcesFound,
          continueChain: r.continueChain,
        },
      });
      if (r.jobId) {
        await prisma.operationalRun.update({
          where: { id: operation.id },
          data: { subjectType: "generation_job", subjectId: r.jobId },
        });
      }
      phasesRun += 1;
      allLogs.push(...r.logs);
      postsCreated += r.postsCreated;
      last = { ...r, logs: allLogs, postsCreated };

      if (r.postsCreated > 0) {
        log(allLogs, `Done after ${phasesRun} phase(s) in ${Date.now() - t0}ms`);
        return finish({ ...last, postsCreated, logs: allLogs, continueChain: false });
      }
      if (!r.continueChain) {
        return finish({ ...last, postsCreated, logs: allLogs, continueChain: false });
      }
    }

    return finish({
      ...last,
      postsCreated,
      logs: allLogs,
      continueChain: last.continueChain && postsCreated === 0,
      phase: last.phase ?? `budget:${phasesRun}`,
    });
  } catch (error) {
    await failOperationalRun(operation.id, error, last.phase ?? "generation");
    throw error;
  }
}

/**
 * Cron entry: pack multiple research/write phases into one 60s invocation.
 * Incomplete jobs resume on the next external cron tick (no self-fetch chain).
 */
export async function runCronPhaseForAllUsers(): Promise<{
  users: number;
  created: number;
  continueChain: boolean;
  results: Array<{
    userId: string;
    postsCreated: number;
    skipReason?: string;
    phase?: string;
    continueChain?: boolean;
  }>;
}> {
  const users = await prisma.user.findMany({ select: { id: true } });
  const results: Array<{
    userId: string;
    postsCreated: number;
    skipReason?: string;
    phase?: string;
    continueChain?: boolean;
  }> = [];
  let created = 0;
  let continueChain = false;

  for (const user of users) {
    try {
      const r = await runPhasesWithBudget(user.id, 52_000, { source: "cron" });
      created += r.postsCreated;
      if (r.continueChain) continueChain = true;
      results.push({
        userId: user.id,
        postsCreated: r.postsCreated,
        skipReason: r.skipReason,
        phase: r.phase,
        continueChain: r.continueChain,
      });
      console.log(
        `[cron-phase] user=${user.id.slice(0, 8)}… phase=${r.phase ?? "—"} created=${r.postsCreated} more=${r.continueChain}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      console.error(`[cron-phase] user=${user.id.slice(0, 8)}… ${msg}`);
      results.push({ userId: user.id, postsCreated: 0, skipReason: msg });
    }
  }

  return { users: users.length, created, continueChain, results };
}
