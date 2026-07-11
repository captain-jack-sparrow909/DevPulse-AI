import { createHash } from "crypto";
import { prisma } from "@/lib/db";
import { collectAllSources, type RawSourceItem } from "@/lib/integrations";
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
import { capturePageScreenshot, shouldIncludeImage } from "@/lib/screenshots/capture";

export interface PipelineOptions {
  userId: string;
  /** Force a specific slot (0–11). If omitted, picks the earliest due unfilled slot. */
  slotIndex?: number;
  /**
   * If true, generate even when the slot time has not arrived yet
   * (manual “prepare next slot early” — still only ONE post).
   */
  allowEarly?: boolean;
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

function demoPostContent(
  platform: "x" | "linkedin",
  source: RawSourceItem,
  angle: string,
): { content: string; title: string; hook: string } {
  const hook = source.title.slice(0, 80);
  if (platform === "x") {
    const body = `${hook}

Angle: ${angle}.
Source: ${source.provider} — worth a look if you care about shipping real systems.

${source.url}`.slice(0, 280);
    return { content: body, title: hook, hook };
  }

  const summary = source.summary?.slice(0, 400) || "Fresh signal from the engineering feed.";
  const content = `${hook}

${summary}

Why it matters:
- Ties into day-to-day engineering work (${angle})
- Grounded in a real source, not a vibe
- Easy to turn into a deeper write-up or thread

Read more: ${source.url}

#engineering #software`;
  return { content, title: hook, hook };
}

async function generateWithAi(params: {
  platform: "x" | "linkedin";
  source: RawSourceItem;
  angle: string;
  stylePrompt: string;
  rules: string;
}): Promise<{ content: string; title: string; hook: string }> {
  const lengthRule =
    params.platform === "x"
      ? "Hard limit: 280 characters for a single tweet. If longer, write a short thread as JSON array field threadParts (2-5 tweets)."
      : "Length: 500–1800 characters. Long-form LinkedIn style with short paragraphs.";

  const user = `Platform: ${params.platform}
Angle: ${params.angle}
Source title: ${params.source.title}
Source url: ${params.source.url}
Source summary: ${params.source.summary || "n/a"}
Provider: ${params.source.provider}

Rules:
${params.rules}
${lengthRule}

Return JSON:
{
  "title": "short internal title",
  "hook": "first line",
  "content": "full post text",
  "threadParts": ["optional", "for x threads only"]
}`;

  const raw = await chatCompletion({
    system: params.stylePrompt + "\n\n" + PROMPTS.writer.system(params.stylePrompt),
    user,
    temperature: 0.75,
    json: true,
  });

  try {
    const parsed = JSON.parse(raw) as {
      title?: string;
      hook?: string;
      content?: string;
      threadParts?: string[];
    };
    let content = parsed.content?.trim() || raw;
    if (params.platform === "x" && parsed.threadParts?.length) {
      content = parsed.threadParts.join("\n\n---\n\n");
    }
    if (params.platform === "x" && content.length > 280 && !content.includes("---")) {
      content = content.slice(0, 277) + "…";
    }
    return {
      content,
      title: parsed.title || params.source.title.slice(0, 100),
      hook: parsed.hook || content.split("\n")[0] || "",
    };
  } catch {
    return {
      content: raw.slice(0, params.platform === "x" ? 280 : 2000),
      title: params.source.title.slice(0, 100),
      hook: raw.split("\n")[0] || "",
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

async function getFilledSlotIndexesToday(
  userId: string,
  timezone: string,
  now: Date,
): Promise<Set<number>> {
  const { start, end } = dayBoundsUtc(now, timezone);
  const rows = await prisma.schedule.findMany({
    where: {
      scheduledFor: { gte: start, lte: end },
      post: { userId },
      status: { not: "cancelled" },
    },
    select: { slotIndex: true },
  });
  return new Set(rows.map((r) => r.slotIndex));
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

  const filled = await getFilledSlotIndexesToday(options.userId, settings.timezone, now);

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
    if (filled.has(options.slotIndex)) {
      log(logs, `Slot ${options.slotIndex + 1}/${plan.postsPerDay} already has a post today — skip`, options.onLog);
      return {
        jobId: null,
        researchRunId: null,
        postsCreated: 0,
        sourcesFound: 0,
        logs,
        skipped: true,
        skipReason: `Slot ${options.slotIndex + 1} already generated today`,
        slotIndex: options.slotIndex,
      };
    }
    const slotTime = plan.slots[options.slotIndex]!;
    if (now < slotTime && !options.allowEarly) {
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
    log(logs, "Collecting live sources (HN, GitHub, arXiv, Reddit, optional X research)…", options.onLog);

    const rawSources = await collectAllSources();
    log(logs, `Fetched ${rawSources.length} raw sources at this moment`, options.onLog);

    const keywords = topics.flatMap((t) => t.keywords.split(",").map((k) => k.trim())).filter(Boolean);
    const ranked = rankSources(rawSources, keywords).slice(0, 40);

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

    const savedSources: { id: string; item: RawSourceItem }[] = [];
    for (const item of ranked) {
      const saved = await prisma.source.upsert({
        where: {
          provider_externalId: { provider: item.provider, externalId: item.externalId },
        },
        create: {
          provider: item.provider,
          externalId: item.externalId,
          title: item.title,
          url: item.url,
          summary: item.summary,
          score: item.score ?? 0,
          rawJson: item.raw ? JSON.stringify(item.raw) : null,
          researchRunId: researchRun.id,
        },
        update: {
          title: item.title,
          url: item.url,
          summary: item.summary,
          score: item.score ?? 0,
          researchRunId: researchRun.id,
          fetchedAt: new Date(),
        },
      });
      savedSources.push({ id: saved.id, item });
    }

    // Prefer unused sources first
    const ordered = [
      ...savedSources.filter((s) => !usedSourceIds.has(s.id)),
      ...savedSources.filter((s) => usedSourceIds.has(s.id)),
    ];

    await prisma.researchRun.update({
      where: { id: researchRun.id },
      data: {
        status: "completed",
        sourcesFound: savedSources.length,
        topicsRanked: JSON.stringify(
          ranked.slice(0, 20).map((s) => ({ title: s.title, provider: s.provider, url: s.url })),
        ),
        completedAt: new Date(),
      },
    });

    log(logs, `Research complete: ${savedSources.length} sources (${ordered.filter((s) => !usedSourceIds.has(s.id)).length} unused today)`, options.onLog);
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
    // Alternate platform by slot so the day balances X and LinkedIn
    const platform = platforms[slotIndex % platforms.length]!;
    const angle = pickAngle(slotIndex);

    let produced = 0;
    let lastError = "";

    for (let attempt = 0; attempt < Math.min(8, ordered.length); attempt++) {
      const picked = ordered[attempt]!;
      const source = picked.item;

      log(logs, `Writing ${platform} post for slot ${slotIndex + 1}: ${source.title.slice(0, 60)}…`, options.onLog);

      let draft = useAi
        ? await generateWithAi({ platform, source, angle, stylePrompt, rules })
        : demoPostContent(platform, source, angle);

      let scores = await scoreContent(draft.content, platform, useAi);

      if (scores.overall < threshold && useAi) {
        log(logs, `Score ${scores.overall} < ${threshold} — rewriting…`, options.onLog);
        try {
          const edited = await chatCompletion({
            system: PROMPTS.editor.system,
            user: `Improve this ${platform} post. Keep facts. Score was ${scores.overall}.\n\n${draft.content}`,
            temperature: 0.5,
          });
          if (edited) {
            draft = { ...draft, content: edited, hook: edited.split("\n")[0] || draft.hook };
            scores = await scoreContent(draft.content, platform, useAi);
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

      const hash = contentHash(draft.content);
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

      const imageDecision = shouldIncludeImage({
        platform,
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
        log(logs, `Capturing screenshot: ${source.url.slice(0, 80)}…`, options.onLog);
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
          log(logs, `Screenshot skipped: ${imageSkipReason}`, options.onLog);
        }
      } else {
        log(logs, `No image: ${imageDecision.reason}`, options.onLog);
      }

      // Generated at due time → ready for review; if slot already passed, still pending_review
      await prisma.post.create({
        data: {
          userId: options.userId,
          platform,
          format: platform === "x" ? (draft.content.includes("---") ? "thread" : "single") : "longform",
          title: draft.title,
          content: draft.content,
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
              platform,
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
      sourcesFound: savedSources.length,
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
