import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { collectAllSources, describeSourceMix, type RawSourceItem } from "@/lib/integrations";
import { diversifySources } from "@/lib/research/ingest";
import { DEFAULT_WRITING_STYLE } from "@/lib/constants";
import { contentHash } from "@/lib/hash";
import { chatCompletion, isAiConfigured } from "./client";
import { ANGLES, PROMPTS } from "./prompts";
import { heuristicScore, parseScores, type QualityScores } from "./scoring";
import {
  buildSlotPlan,
  dayBoundsUtc,
  formatSlotDateTime,
  pickNextMissingDueSlot,
} from "@/lib/schedule/slots";
import { clearSlotForRegenerate, getOccupiedSlotIndexes } from "@/lib/schedule/slot-actions";
import { capturePageScreenshot, shouldIncludeImage } from "@/lib/screenshots/capture";
import {
  enforceXLimit,
  splitIntoXChunks,
  X_CHAR_LIMIT,
} from "@/lib/content/platforms";

export interface PipelineOptions {
  userId: string;
  /** Force a specific slot (0–11). If omitted, picks the earliest due unfilled slot. */
  slotIndex?: number;
  /**
   * If true, generate even when the slot time has not arrived yet
   * (manual “prepare next slot early” — still only ONE post).
   */
  allowEarly?: boolean;
  /**
   * Clear any existing post for the target slot today, then generate a fresh one.
   * Requires slotIndex (or regenerates the earliest due occupied slot when combined with logic below).
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

type DualDraft = {
  title: string;
  hook: string;
  linkedIn: string;
  xThread: string[];
};

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
}): Promise<DualDraft> {
  const user = `Write ONE idea as two platform formats from the same source.

Angle: ${params.angle}
Source title: ${params.source.title}
Source url: ${params.source.url}
Source summary: ${params.source.summary || "n/a"}
Provider: ${params.source.provider}

Rules:
${params.rules}

LinkedIn:
- Long-form, 500–2000 characters
- Short paragraphs, senior-engineer voice
- Educational, no clickbait

X (Twitter):
- Array of tweets. EACH tweet must be ≤ ${X_CHAR_LIMIT} characters (hard limit).
- If the idea needs more space, write a thread (2–8 tweets), each self-contained enough to scan.
- Do NOT put more than ${X_CHAR_LIMIT} characters in any xThread item.
- Include the source URL in the last tweet when possible.

Return JSON only:
{
  "title": "short internal title",
  "hook": "first line shared vibe",
  "linkedin": "full LinkedIn post text",
  "xThread": ["tweet 1 ≤280 chars", "tweet 2 ≤280 chars"]
}`;

  const raw = await chatCompletion({
    system: params.stylePrompt + "\n\nAlways produce both LinkedIn long-form and an X thread with hard 280-char limits per tweet.",
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
      threadParts?: string[];
    };
    const linkedIn = (
      parsed.linkedin ||
      parsed.linkedIn ||
      parsed.content ||
      raw
    ).trim();
    let xThread = enforceXLimit(
      parsed.xThread?.length
        ? parsed.xThread.map(String)
        : parsed.threadParts?.length
          ? parsed.threadParts.map(String)
          : splitIntoXChunks(linkedIn),
    );
    if (xThread.length === 0) {
      xThread = splitIntoXChunks(linkedIn);
    }
    return {
      title: parsed.title || params.source.title.slice(0, 100),
      hook: parsed.hook || linkedIn.split("\n")[0] || "",
      linkedIn,
      xThread,
    };
  } catch {
    const linkedIn = raw.slice(0, 2000);
    return {
      title: params.source.title.slice(0, 100),
      hook: raw.split("\n")[0] || "",
      linkedIn,
      xThread: splitIntoXChunks(linkedIn),
    };
  }
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
  const settings = await prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });

  const topicCount = await prisma.topic.count({ where: { userId } });
  if (topicCount === 0) {
    const { DEFAULT_TOPICS } = await import("@/lib/constants");
    for (const t of DEFAULT_TOPICS) {
      await prisma.topic.create({
        data: {
          userId,
          name: t.name,
          slug: t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          keywords: t.keywords,
        },
      });
    }
  }

  const style = await prisma.writingStyle.findFirst({ where: { userId, isDefault: true } });
  if (!style) {
    await prisma.writingStyle.create({
      data: {
        userId,
        name: DEFAULT_WRITING_STYLE.name,
        isDefault: true,
        systemPrompt: DEFAULT_WRITING_STYLE.systemPrompt,
        rules: DEFAULT_WRITING_STYLE.rules,
        examples: DEFAULT_WRITING_STYLE.examples,
      },
    });
  }

  const model = await prisma.modelConfig.findFirst({ where: { userId, isDefault: true } });
  if (!model) {
    await prisma.modelConfig.create({
      data: {
        userId,
        name: "DeepSeek Chat",
        provider: "deepseek",
        model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
        baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
        isDefault: true,
      },
    });
  }

  return settings;
}

/**
 * Generate exactly ONE post for the next due calendar slot.
 *
 * Why not 12 at once? Later slots re-run research so midday trends appear
 * the same day instead of waiting until tomorrow.
 */
export async function runDueSlotGeneration(options: PipelineOptions): Promise<PipelineResult> {
  const logs: string[] = [];
  const platforms = options.platforms ?? ["x", "linkedin"];
  const useAi = isAiConfigured();
  const now = new Date();

  const settings = await ensureUserDefaults(options.userId);
  const plan = buildSlotPlan(
    now,
    settings.timezone,
    settings.firstPostHour,
    settings.lastPostHour,
    settings.postsPerDay,
  );

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
    const cleared = await clearSlotForRegenerate(options.userId, options.slotIndex);
    log(
      logs,
      `Regenerate: cleared ${cleared.deleted} post(s) for slot ${options.slotIndex + 1}`,
      options.onLog,
    );
  }

  const filled = await getOccupiedSlotIndexes(options.userId, settings.timezone, now);

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
    const missing = pickNextMissingDueSlot(plan, filled);
    if (!missing) {
      // Optional: draft the next upcoming unfilled slot before its due time
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
            `Early mode: preparing slot ${slotIndex + 1} before due (${formatSlotDateTime(scheduledFor, plan.timezone)})`,
            options.onLog,
          );
        } else {
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
      } else if (plan.dueSlotIndexes.length === 0) {
        const nextLabel = plan.nextUpcomingAt
          ? formatSlotDateTime(plan.nextUpcomingAt, plan.timezone)
          : "tomorrow";
        log(logs, `No slot due yet. Next slot: ${nextLabel}`, options.onLog);
        return {
          jobId: null,
          researchRunId: null,
          postsCreated: 0,
          sourcesFound: 0,
          logs,
          skipped: true,
          skipReason: `No slot due yet. Next: ${nextLabel}`,
          slotIndex: plan.nextUpcomingIndex ?? undefined,
          scheduledFor: plan.nextUpcomingAt?.toISOString(),
        };
      } else {
        log(logs, `All due slots for today are already filled (${filled.size}/${plan.postsPerDay})`, options.onLog);
        return {
          jobId: null,
          researchRunId: null,
          postsCreated: 0,
          sourcesFound: 0,
          logs,
          skipped: true,
          skipReason: "All due slots already have posts for today",
        };
      }
    } else {
      slotIndex = missing.slotIndex;
      scheduledFor = missing.scheduledFor;
    }
  }

  log(
    logs,
    `Slot-based generation: slot ${slotIndex + 1}/${plan.postsPerDay} · ${formatSlotDateTime(scheduledFor, plan.timezone)} · ${plan.timezone}`,
    options.onLog,
  );
  log(logs, "Fresh research for this slot only (not batching all 12)", options.onLog);

  const topics = await prisma.topic.findMany({ where: { userId: options.userId, active: true } });
  const style =
    (await prisma.writingStyle.findFirst({
      where: { userId: options.userId, isDefault: true },
    })) || null;

  const job = await prisma.generationJob.create({
    data: {
      userId: options.userId,
      status: "researching",
      targetCount: 1,
      logsJson: "[]",
    },
  });

  const researchRun = await prisma.researchRun.create({
    data: {
      userId: options.userId,
      status: "running",
    },
  });

  await prisma.generationJob.update({
    where: { id: job.id },
    data: { researchRunId: researchRun.id },
  });

  try {
    log(
      logs,
      useAi ? "AI mode: DeepSeek configured" : "Demo mode: no DEEPSEEK_API_KEY — template writer",
      options.onLog,
    );
    log(logs, "Manual posting mode: never auto-posting to X/LinkedIn", options.onLog);
    log(
      logs,
      "Collecting sources (RSS, HN, GitHub, arXiv, HF, Reddit, Dev.to, SO, Tavily, PH, light X)…",
      options.onLog,
    );

    const rawSources = await collectAllSources();
    log(
      logs,
      `Fetched ${rawSources.length} raw sources · ${describeSourceMix(rawSources)}`,
      options.onLog,
    );

    // Persist a diversified feed (not only topic-matched HN/arXiv)
    const toStore = diversifySources(rawSources, 120, 14);
    log(logs, `Storing diversified set: ${toStore.length} · ${describeSourceMix(toStore)}`, options.onLog);

    const keywords = topics.flatMap((t) => t.keywords.split(",").map((k) => k.trim())).filter(Boolean);
    // Rank full catalog for writing, but prefer diversity + unused
    const ranked = rankSources(rawSources, keywords);

    // Prefer sources not already used in today's posts
    const { start, end } = dayBoundsUtc(now, settings.timezone);
    const usedSourceIds = new Set(
      (
        await prisma.postSource.findMany({
          where: {
            post: {
              userId: options.userId,
              createdAt: { gte: start, lte: end },
            },
          },
          select: { sourceId: true },
        })
      ).map((r) => r.sourceId),
    );

    const savedByKey = new Map<string, { id: string; item: RawSourceItem }>();
    for (const item of toStore) {
      const externalId = item.externalId.slice(0, 190);
      const saved = await prisma.source.upsert({
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
          researchRunId: researchRun.id,
        },
        update: {
          title: item.title.slice(0, 500),
          url: item.url,
          summary: item.summary?.slice(0, 2000),
          score: item.score ?? 0,
          researchRunId: researchRun.id,
          fetchedAt: new Date(),
        },
      });
      savedByKey.set(`${item.provider}:${externalId}`, { id: saved.id, item });
    }

    // Also ensure top ranked candidates for writing are in DB
    for (const item of ranked.slice(0, 40)) {
      const externalId = item.externalId.slice(0, 190);
      const key = `${item.provider}:${externalId}`;
      if (savedByKey.has(key)) continue;
      const saved = await prisma.source.upsert({
        where: { provider_externalId: { provider: item.provider, externalId } },
        create: {
          provider: item.provider,
          externalId,
          title: item.title.slice(0, 500),
          url: item.url,
          summary: item.summary?.slice(0, 2000),
          score: item.score ?? 0,
          researchRunId: researchRun.id,
        },
        update: {
          title: item.title.slice(0, 500),
          url: item.url,
          summary: item.summary?.slice(0, 2000),
          score: item.score ?? 0,
          researchRunId: researchRun.id,
          fetchedAt: new Date(),
        },
      });
      savedByKey.set(key, { id: saved.id, item });
    }

    // Order writing candidates: unused + high rank, diversified
    const rankedSaved = ranked
      .map((item) => savedByKey.get(`${item.provider}:${item.externalId.slice(0, 190)}`))
      .filter((x): x is { id: string; item: RawSourceItem } => Boolean(x));

    const ordered = [
      ...rankedSaved.filter((s) => !usedSourceIds.has(s.id)),
      ...rankedSaved.filter((s) => usedSourceIds.has(s.id)),
      ...[...savedByKey.values()].filter(
        (s) => !rankedSaved.some((r) => r.id === s.id) && !usedSourceIds.has(s.id),
      ),
    ];

    await prisma.researchRun.update({
      where: { id: researchRun.id },
      data: {
        status: "completed",
        sourcesFound: savedByKey.size,
        topicsRanked: JSON.stringify(
          ordered.slice(0, 20).map((s) => ({
            title: s.item.title,
            provider: s.item.provider,
            url: s.item.url,
          })),
        ),
        completedAt: new Date(),
      },
    });

    log(
      logs,
      `Research complete: ${savedByKey.size} sources stored · ${ordered.filter((s) => !usedSourceIds.has(s.id)).length} unused candidates today`,
      options.onLog,
    );
    await prisma.generationJob.update({
      where: { id: job.id },
      data: { status: "writing", logsJson: JSON.stringify(logs) },
    });

    if (ordered.length === 0) {
      throw new Error("No research sources available to write about");
    }

    const existingHashes = new Set(
      (
        await prisma.post.findMany({
          where: { userId: options.userId },
          select: { contentHash: true },
          take: 500,
          orderBy: { createdAt: "desc" },
        })
      ).map((p) => p.contentHash),
    );

    const stylePrompt = style?.systemPrompt || DEFAULT_WRITING_STYLE.systemPrompt;
    const rules = style?.rules || DEFAULT_WRITING_STYLE.rules;
    const threshold = settings.qualityThreshold;
    // Every slot pack is dual-format: LinkedIn long-form + X thread (≤280 each)
    void platforms; // reserved for future per-platform toggles
    const angle = pickAngle(slotIndex);

    let produced = 0;
    let lastError = "";

    for (let attempt = 0; attempt < Math.min(8, ordered.length); attempt++) {
      const picked = ordered[attempt]!;
      const source = picked.item;

      log(
        logs,
        `Writing dual pack (LinkedIn + X) for slot ${slotIndex + 1}: ${source.title.slice(0, 60)}…`,
        options.onLog,
      );

      let draft: DualDraft = useAi
        ? await generateDualWithAi({ source, angle, stylePrompt, rules })
        : demoDualContent(source, angle);

      draft.xThread = enforceXLimit(draft.xThread);
      log(
        logs,
        `Formats ready: LinkedIn ${draft.linkedIn.length} chars · X ${draft.xThread.length} tweet(s), max ${Math.max(0, ...draft.xThread.map((t) => t.length))}/${X_CHAR_LIMIT}`,
        options.onLog,
      );

      // Score primarily on LinkedIn body (full idea); X is a constrained rewrite
      let scores = await scoreContent(draft.linkedIn, "linkedin", useAi);

      if (scores.overall < threshold && useAi) {
        log(logs, `Score ${scores.overall} < ${threshold} — rewriting LinkedIn body…`, options.onLog);
        try {
          const edited = await chatCompletion({
            system: PROMPTS.editor.system,
            user: `Improve this LinkedIn post. Keep facts. Score was ${scores.overall}.\n\n${draft.linkedIn}`,
            temperature: 0.5,
          });
          if (edited) {
            draft = {
              ...draft,
              linkedIn: edited,
              hook: edited.split("\n")[0] || draft.hook,
              // Rebuild X thread from improved body if original was weak
              xThread: draft.xThread.length
                ? enforceXLimit(draft.xThread)
                : splitIntoXChunks(edited),
            };
            scores = await scoreContent(draft.linkedIn, "linkedin", useAi);
          }
        } catch {
          // keep original
        }
      }

      if (scores.overall < threshold - 1.5 && useAi) {
        lastError = `Low quality score ${scores.overall}`;
        log(logs, `Rejected draft (${scores.overall}), trying next source…`, options.onLog);
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

      // Always attempt Playwright screenshot for the chosen slot source
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

      if (imageDecision.needsImage) {
        log(logs, `Playwright screenshot for chosen source: ${source.url.slice(0, 90)}…`, options.onLog);
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

      await prisma.post.create({
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
      });

      produced = 1;
      break;
    }

    if (produced === 0) {
      throw new Error(lastError || "Could not produce a quality post for this slot");
    }

    await prisma.generationJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        producedCount: 1,
        logsJson: JSON.stringify(logs),
        completedAt: new Date(),
      },
    });

    log(
      logs,
      `Done: 1 post for slot ${slotIndex + 1}/${plan.postsPerDay}. Review → approve → post manually. Next slot will re-research live trends.`,
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
 * Cron entry: for each user (or one user), generate at most one due-slot post.
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
      const r = await runDueSlotGeneration({ userId: user.id });
      created += r.postsCreated;
      results.push({
        userId: user.id,
        postsCreated: r.postsCreated,
        skipReason: r.skipReason,
      });
    } catch (err) {
      results.push({
        userId: user.id,
        postsCreated: 0,
        skipReason: err instanceof Error ? err.message : "error",
      });
    }
  }

  return { users: users.length, created, results };
}

export function fingerprint(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 12);
}
