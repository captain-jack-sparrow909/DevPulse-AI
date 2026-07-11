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
import { PROMPTS, ANGLES } from "@/lib/ai/prompts";
import { heuristicScore } from "@/lib/ai/scoring";
import {
  buildSlotPlan,
  dayBoundsUtc,
  formatSlotDateTime,
  listStaleMissedDueSlots,
  pickSlotForGeneration,
} from "@/lib/schedule/slots";
import { getOccupiedSlotIndexes, skipSlot } from "@/lib/schedule/slot-actions";
import {
  orderCandidatesForSlot,
  MAX_POSTS_PER_PROVIDER_PER_DAY,
  describeProviderCounts,
  SLOT_LANE_LABELS,
  SLOT_PROVIDER_ROTATION,
} from "@/lib/research/diversity";
import {
  RESEARCH_CHUNKS,
  collectResearchChunk,
  researchChunkCount,
} from "@/lib/research/chunks";
import type { RawSourceItem } from "@/lib/integrations/types";
import {
  enforceXLimit,
  splitIntoXChunks,
  X_CHAR_LIMIT,
} from "@/lib/content/platforms";
import { ensureUserDefaults } from "@/lib/ai/pipeline";

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
}

export interface PhasedJobMeta {
  kind: "phased_v1";
  slotIndex: number;
  scheduledFor: string;
  nextChunkIndex: number;
  totalChunks: number;
  generationJobId: string;
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
  let n = 0;
  for (const item of items) {
    const externalId = item.externalId.slice(0, 190);
    await prisma.source.upsert({
      where: {
        provider_externalId: { provider: item.provider, externalId },
      },
      create: {
        provider: item.provider,
        externalId,
        title: item.title.slice(0, 500),
        url: item.url,
        summary: item.summary?.slice(0, 2000),
        score: item.score ?? 0,
        rawJson: item.raw ? JSON.stringify(item.raw).slice(0, 50_000) : null,
        researchRunId,
      },
      update: {
        title: item.title.slice(0, 500),
        url: item.url,
        summary: item.summary?.slice(0, 2000),
        score: item.score ?? 0,
        researchRunId,
        fetchedAt: new Date(),
      },
    });
    n++;
  }
  return n;
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
  const plan = buildSlotPlan(
    now,
    settings.timezone,
    settings.firstPostHour,
    settings.lastPostHour,
    settings.postsPerDay,
  );
  const { start, end } = dayBoundsUtc(now, settings.timezone);

  // Mark stuck jobs failed (killed mid-phase)
  await prisma.generationJob.updateMany({
    where: {
      userId,
      status: { in: ["research", "researching", "write", "writing"] },
      updatedAt: { lt: new Date(Date.now() - 12 * 60 * 1000) },
    },
    data: {
      status: "failed",
      error: "Phase timed out / interrupted — will start fresh on next due slot tick",
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
      if (openJob.status === "write" || openJob.status === "writing") {
        return runWritePhase(userId, openJob.id, openJob.researchRunId, meta, logs);
      }
      return runResearchChunkPhase(userId, openJob.id, openJob.researchRunId, meta, logs);
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

  const researchRun = await prisma.researchRun.create({
    data: { userId, status: "running" },
  });

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

  const meta: PhasedJobMeta = {
    kind: "phased_v1",
    slotIndex: pick.slotIndex,
    scheduledFor: pick.scheduledFor.toISOString(),
    nextChunkIndex: 0,
    totalChunks: researchChunkCount(),
    generationJobId: job.id,
  };

  await prisma.researchRun.update({
    where: { id: researchRun.id },
    data: { topicsRanked: JSON.stringify(meta) },
  });

  log(
    logs,
    `Started phased job for slot ${pick.slotIndex + 1} · ${formatSlotDateTime(pick.scheduledFor, plan.timezone)} · mode=${pick.mode} · ${meta.totalChunks} research chunks + 1 write`,
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

  if (chunkIndex >= meta.totalChunks) {
    // All research done → move to write
    await prisma.generationJob.update({
      where: { id: jobId },
      data: { status: "write" },
    });
    log(logs, "All research chunks complete → entering write phase");
    await appendJobLogs(jobId, logs);
    return runWritePhase(userId, jobId, researchRunId, meta, []);
  }

  const def = RESEARCH_CHUNKS[chunkIndex]!;
  log(
    logs,
    `Research chunk ${chunkIndex + 1}/${meta.totalChunks}: ${def.label} (${def.id})…`,
  );

  try {
    const { items, mix } = await collectResearchChunk(chunkIndex);
    const stored = await persistSources(researchRunId, items);

    const run = await prisma.researchRun.findUnique({ where: { id: researchRunId } });
    const sourcesFound = (run?.sourcesFound ?? 0) + stored;

    const nextMeta: PhasedJobMeta = {
      ...meta,
      nextChunkIndex: chunkIndex + 1,
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
  const plan = buildSlotPlan(
    now,
    settings.timezone,
    settings.firstPostHour,
    settings.lastPostHour,
    settings.postsPerDay,
  );

  const slotIndex = meta.slotIndex;
  const scheduledFor = new Date(meta.scheduledFor);

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

    const asRaw: RawSourceItem[] = dbSources.map((s) => ({
      provider: s.provider as RawSourceItem["provider"],
      externalId: s.externalId,
      title: s.title,
      url: s.url,
      summary: s.summary ?? undefined,
      score: s.score,
    }));

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

    const ordered = orderCandidatesForSlot(candidates, {
      slotIndex,
      usedSourceIds,
      usedProviderCounts,
      maxPerProvider: MAX_POSTS_PER_PROVIDER_PER_DAY,
    });

    const lane = SLOT_LANE_LABELS[slotIndex % SLOT_LANE_LABELS.length] ?? "mixed";
    const preferred = SLOT_PROVIDER_ROTATION[slotIndex % SLOT_PROVIDER_ROTATION.length] ?? [];
    log(
      logs,
      `Lane=${lane} prefer=[${preferred.join(",")}] top=${ordered
        .slice(0, 5)
        .map((c) => c.item.provider)
        .join("→")}`,
    );

    const existingHashes = new Set(
      (
        await prisma.post.findMany({
          where: { userId },
          select: { contentHash: true },
          take: 500,
          orderBy: { createdAt: "desc" },
        })
      ).map((p) => p.contentHash),
    );

    const stylePrompt = style?.systemPrompt || DEFAULT_WRITING_STYLE.systemPrompt;
    const rules = style?.rules || DEFAULT_WRITING_STYLE.rules;
    const threshold = settings.qualityThreshold;
    const angle = ANGLES[slotIndex % ANGLES.length]!;

    let produced = 0;
    let lastError = "";

    for (let attempt = 0; attempt < Math.min(5, ordered.length); attempt++) {
      const picked = ordered[attempt]!;
      const source = picked.item;
      const providerUses = usedProviderCounts.get(source.provider) ?? 0;
      if (providerUses >= MAX_POSTS_PER_PROVIDER_PER_DAY && attempt < ordered.length - 2) {
        log(logs, `Skip ${source.provider} (quota)`);
        continue;
      }

      log(logs, `Writing from [${source.provider}] ${source.title.slice(0, 70)}…`);

      let draft = useAi
        ? await writeDual(source, angle, stylePrompt, rules)
        : demoDual(source, angle);

      draft.xThread = enforceXLimit(draft.xThread);
      const scores = heuristicScore(draft.linkedIn, "linkedin");

      if (scores.overall < threshold - 3 && useAi) {
        lastError = `Low score ${scores.overall}`;
        log(logs, `Reject score ${scores.overall}, next source…`);
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

      await prisma.post.create({
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
          hook: draft.hook,
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
) {
  const user = `Write ONE idea as two platform formats from the same source.

Angle: ${angle}
Source title: ${source.title}
Source url: ${source.url}
Source summary: ${source.summary || "n/a"}
Provider: ${source.provider}

Match the source type (github→repo, arxiv→paper, hn/reddit→discussion, rss/devto→blog, so→howto, etc.).

Rules:
${rules}

LinkedIn: 500–2000 chars, short paragraphs, senior-engineer voice.
X: array of tweets each ≤ ${X_CHAR_LIMIT} chars. URL in last tweet when possible.

Return JSON only:
{"title":"...","hook":"...","linkedin":"...","xThread":["..."]}`;

  const raw = await chatCompletion({
    system:
      stylePrompt +
      "\n\nAlways produce both LinkedIn long-form and an X thread with hard 280-char limits per tweet.",
    user,
    temperature: 0.75,
    json: true,
  });

  try {
    const parsed = JSON.parse(raw) as {
      title?: string;
      hook?: string;
      linkedin?: string;
      linkedIn?: string;
      content?: string;
      xThread?: string[];
    };
    const linkedIn = (parsed.linkedin || parsed.linkedIn || parsed.content || raw).trim();
    let xThread = enforceXLimit(
      parsed.xThread?.length ? parsed.xThread.map(String) : splitIntoXChunks(linkedIn),
    );
    if (xThread.length === 0) xThread = splitIntoXChunks(linkedIn);
    return {
      title: parsed.title || source.title.slice(0, 100),
      hook: parsed.hook || linkedIn.split("\n")[0] || "",
      linkedIn,
      xThread,
    };
  } catch {
    return {
      title: source.title.slice(0, 100),
      hook: raw.split("\n")[0] || "",
      linkedIn: raw.slice(0, 2000),
      xThread: splitIntoXChunks(raw),
    };
  }
}

/**
 * Cron entry: one phase per user. Caller should self-chain when continueChain.
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
      const r = await runOneGenerationPhase(user.id);
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
        `[cron-phase] user=${user.id.slice(0, 8)}… phase=${r.phase ?? "—"} created=${r.postsCreated} chain=${r.continueChain}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      console.error(`[cron-phase] user=${user.id.slice(0, 8)}… ${msg}`);
      results.push({ userId: user.id, postsCreated: 0, skipReason: msg });
    }
  }

  return { users: users.length, created, continueChain, results };
}
