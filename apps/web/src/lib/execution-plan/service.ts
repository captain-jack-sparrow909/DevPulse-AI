import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { dailyPostTimesFromSettings, dayBoundsUtc } from "@/lib/schedule/slots";
import { getContentStrategy } from "@/lib/content/strategy-store";
import { DEFAULT_CONTENT_STRATEGY, contentTypeForSlot, type ContentMixItem, type ContentStrategyConfig, type ContentType } from "@/lib/content/strategy";
import { buildExecutionPlan } from "@/lib/execution-plan/engine";
import { effectivePostsPerDay } from "@/lib/publishing/adaptive";

function json<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function createWeeklyExecutionPlan(userId: string, reviewId?: string) {
  const [settings, strategy, review] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    getContentStrategy(userId),
    reviewId
      ? prisma.weeklyGrowthReview.findFirst({ where: { id: reviewId, userId }, include: { decisions: { orderBy: { priority: "asc" } } } })
      : prisma.weeklyGrowthReview.findFirst({ where: { userId }, orderBy: { periodEnd: "desc" }, include: { decisions: { orderBy: { priority: "asc" } } } }),
  ]);
  if (!review) throw new Error("Generate a weekly growth review before creating an execution plan.");
  const existing = await prisma.weeklyExecutionPlan.findUnique({
    where: { reviewId: review.id },
    include: { items: { orderBy: { sequence: "asc" } }, review: true },
  });
  if (existing) return existing;

  const timezone = settings?.timezone || "Asia/Dubai";
  const nextDayStart = new Date(dayBoundsUtc(new Date(), timezone).end.getTime() + 1);
  const [activeExperiments, activeCampaigns] = await Promise.all([
    prisma.growthExperiment.findMany({
      where: { userId, status: "active" },
      select: { id: true, name: true, platform: true, dimension: true },
    }),
    prisma.campaign.findMany({
      where: { userId, status: "active" },
      select: { id: true, name: true, projectId: true, ctaMode: true, destinationUrl: true },
    }),
  ]);
  const draft = buildExecutionPlan({
    startDate: nextDayStart,
    timezone,
    firstPostHour: settings?.firstPostHour ?? 6,
    lastPostHour: settings?.lastPostHour ?? 21,
    postsPerDay: settings ? effectivePostsPerDay(settings) : 2,
    dailyPostTimes: settings ? dailyPostTimesFromSettings(settings) : [],
    strategy,
    reviewId: review.id,
    reviewStatus: review.status,
    reviewSummary: json(review.summaryJson, {}),
    reviewBrief: json(review.nextWeekBriefJson, {}),
    decisions: review.decisions.map((decision) => ({
      id: decision.id,
      category: decision.category,
      title: decision.title,
      status: decision.status,
      action: json(decision.actionJson, {}),
    })),
    activeExperiments,
    activeCampaigns,
  });
  const weekKey = formatInTimeZone(draft.periodStart, timezone, "yyyy-MM-dd");
  return prisma.weeklyExecutionPlan.create({
    data: {
      userId,
      reviewId: review.id,
      weekKey,
      timezone,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      briefJson: JSON.stringify(draft.brief),
      evidenceJson: JSON.stringify(draft.evidence),
      items: {
        create: draft.items.map((item) => ({
          sequence: item.sequence,
          scheduledFor: item.scheduledFor,
          slotIndex: item.slotIndex,
          contentType: item.contentType,
          projectId: item.projectId,
          projectName: item.projectName,
          objective: item.objective,
          angle: item.angle,
          platforms: item.platforms,
          mediaType: item.mediaType,
          ctaJson: JSON.stringify(item.cta),
          distributionJson: JSON.stringify(item.distribution),
          measurementJson: JSON.stringify(item.measurement),
          experimentId: item.experimentId,
          campaignId: item.campaignId,
          sourceDecisionIds: JSON.stringify(item.sourceDecisionIds),
        })),
      },
    },
    include: { items: { orderBy: { sequence: "asc" } }, review: true },
  });
}

export async function updateWeeklyExecutionPlan(userId: string, planId: string, action: "approve" | "cancel" | "complete") {
  const plan = await prisma.weeklyExecutionPlan.findFirst({
    where: { id: planId, userId },
    include: { review: true, items: true },
  });
  if (!plan) throw new Error("Execution plan not found");
  const now = new Date();
  if (action === "approve") {
    if (plan.status !== "draft") throw new Error("Only a draft plan can be approved");
    if (plan.review.status !== "reviewed") {
      throw new Error("Apply or reject all three weekly-review decisions before approving this plan.");
    }
    const viable = plan.items.filter((item) => item.status !== "rejected");
    if (viable.length < 3) throw new Error("Keep at least three anchor items before approving the week.");
    const overlap = await prisma.weeklyExecutionPlan.findFirst({
      where: {
        userId,
        id: { not: plan.id },
        status: "approved",
        periodStart: { lt: plan.periodEnd },
        periodEnd: { gt: plan.periodStart },
      },
    });
    if (overlap) throw new Error("Another approved execution plan overlaps this period.");
    return prisma.$transaction(async (tx) => {
      await tx.executionPlanItem.updateMany({
        where: { planId: plan.id, status: "proposed" },
        data: { status: "approved", decidedAt: now },
      });
      return tx.weeklyExecutionPlan.update({
        where: { id: plan.id },
        data: { status: "approved", approvedAt: now },
        include: { items: { orderBy: { sequence: "asc" } }, review: true },
      });
    });
  }
  if (action === "cancel") {
    if (["completed", "cancelled"].includes(plan.status)) throw new Error("Plan is already closed");
    return prisma.weeklyExecutionPlan.update({
      where: { id: plan.id },
      data: { status: "cancelled", cancelledAt: now },
      include: { items: { orderBy: { sequence: "asc" } }, review: true },
    });
  }
  if (plan.status !== "approved") throw new Error("Only an approved plan can be completed");
  const openItems = plan.items.filter((item) => ["approved", "drafted", "published"].includes(item.status));
  if (openItems.length) throw new Error(`${openItems.length} anchor item(s) still require execution, measurement, or skipping.`);
  return prisma.weeklyExecutionPlan.update({
    where: { id: plan.id },
    data: { status: "completed", completedAt: now },
    include: { items: { orderBy: { sequence: "asc" } }, review: true },
  });
}

export async function updateExecutionPlanItem(
  userId: string,
  planId: string,
  itemId: string,
  action: "reject" | "restore" | "skip" | "published" | "measured",
) {
  const item = await prisma.executionPlanItem.findFirst({
    where: { id: itemId, planId, plan: { userId } },
    include: { plan: true, post: { include: { performanceSnapshots: true } } },
  });
  if (!item) throw new Error("Execution item not found");
  const now = new Date();
  if (action === "reject" || action === "restore") {
    if (item.plan.status !== "draft") throw new Error("Draft items can only be edited before plan approval");
    return prisma.executionPlanItem.update({
      where: { id: item.id },
      data: { status: action === "reject" ? "rejected" : "proposed", decidedAt: action === "reject" ? now : null },
    });
  }
  if (item.plan.status !== "approved") throw new Error("Approve the plan before updating execution status");
  if (action === "skip") {
    if (!["approved", "drafted"].includes(item.status)) throw new Error("Only approved or drafted items can be skipped");
    return prisma.executionPlanItem.update({ where: { id: item.id }, data: { status: "skipped", decidedAt: now } });
  }
  if (!item.post) throw new Error("This anchor does not have a generated post yet");
  if (action === "published") {
    if (item.post.status !== "posted_manually") throw new Error("Mark the linked post as manually published first");
    return prisma.executionPlanItem.update({ where: { id: item.id }, data: { status: "published", decidedAt: now } });
  }
  const valid24h = item.post.performanceSnapshots.some((snapshot) => {
    const ageHours = (snapshot.capturedAt.getTime() - (item.post?.postedManuallyAt?.getTime() ?? 0)) / (60 * 60 * 1_000);
    return item.post?.postedManuallyAt && ageHours >= 18 && ageHours <= 36;
  });
  if (!valid24h) throw new Error("Capture a valid 24-hour performance snapshot before marking this anchor measured");
  return prisma.executionPlanItem.update({ where: { id: item.id }, data: { status: "measured", decidedAt: now } });
}

export interface ExecutionDirective {
  id: string;
  contentType: ContentType;
  projectId: string | null;
  projectName: string | null;
  objective: string;
  angle: string;
  mediaType: string;
}

export async function resolveExecutionDirective(userId: string, scheduledFor: Date, slotIndex: number): Promise<ExecutionDirective | null> {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const timezone = settings?.timezone || "Asia/Dubai";
  const { start, end } = dayBoundsUtc(scheduledFor, timezone);
  const item = await prisma.executionPlanItem.findFirst({
    where: {
      slotIndex,
      scheduledFor: { gte: start, lte: end },
      status: "approved",
      postId: null,
      plan: { userId, status: "approved" },
    },
    orderBy: { scheduledFor: "asc" },
  });
  if (!item) return null;
  return {
    id: item.id,
    contentType: item.contentType as ContentType,
    projectId: item.projectId,
    projectName: item.projectName,
    objective: item.objective,
    angle: item.angle,
    mediaType: item.mediaType,
  };
}

export function executionContentItem(
  directive: ExecutionDirective | null,
  strategy: ContentStrategyConfig,
  slotIndex: number,
): ContentMixItem {
  if (!directive) return contentTypeForSlot(slotIndex, strategy.contentMix);
  return executionContentItemForType(directive.contentType, strategy, slotIndex);
}

export function executionContentItemForType(
  contentType: ContentType | null | undefined,
  strategy: ContentStrategyConfig,
  slotIndex: number,
): ContentMixItem {
  if (!contentType) return contentTypeForSlot(slotIndex, strategy.contentMix);
  return strategy.contentMix.find((item) => item.type === contentType)
    ?? DEFAULT_CONTENT_STRATEGY.contentMix.find((item) => item.type === contentType)
    ?? contentTypeForSlot(slotIndex, strategy.contentMix);
}

export async function linkExecutionDirective(itemId: string | null | undefined, postId: string) {
  if (!itemId) return;
  await prisma.executionPlanItem.updateMany({
    where: { id: itemId, status: "approved", postId: null },
    data: { postId, status: "drafted" },
  });
}
