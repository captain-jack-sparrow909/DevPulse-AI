import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@/lib/db";
import { buildPerformanceReport, type PerformanceRecord } from "@/lib/analytics/performance";
import { buildAttributionReport } from "@/lib/attribution/report";
import { buildDistributionComparison } from "@/lib/distribution/service";
import { getContentStrategy } from "@/lib/content/strategy-store";
import { getExperimentViews } from "@/lib/experiments/service";
import { EXPERIMENT_DIMENSIONS } from "@/lib/experiments/definitions";
import { buildOperationsReport } from "@/lib/operations/report";
import {
  buildWeeklyReview,
  type WeeklyReviewAction,
  type WeeklyReviewEvidence,
} from "@/lib/growth-review/engine";

const DAY = 24 * 60 * 60 * 1_000;

function performanceRecord(row: {
  id: string;
  postId: string;
  platform: string;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  saves: number;
  profileVisits: number;
  linkClicks: number;
  followersBefore: number | null;
  followersAfter: number | null;
  capturedAt: Date;
  post: PerformanceRecord["post"];
}): PerformanceRecord {
  return { ...row, platform: row.platform === "linkedin" ? "linkedin" : "x" };
}

function periodPerformance(records: PerformanceRecord[], timezone: string) {
  const report = buildPerformanceReport(records, timezone);
  return {
    summary: report.summary,
    byPlatform: report.byPlatform,
    byContentType: report.byContentType,
    byProject: report.byProject,
    byMediaType: report.byMediaType,
  };
}

function parseAction(raw: string): WeeklyReviewAction {
  const parsed = JSON.parse(raw) as WeeklyReviewAction;
  if (!parsed || typeof parsed !== "object" || typeof parsed.type !== "string") {
    throw new Error("Stored review action is invalid");
  }
  return parsed;
}

function sameMix(left: Array<{ type: string; weight: number }>, right: Array<{ type: string; weight: number }>) {
  return JSON.stringify(left.map(({ type, weight }) => ({ type, weight }))) ===
    JSON.stringify(right.map(({ type, weight }) => ({ type, weight })));
}

export async function createWeeklyGrowthReview(userId: string, now = new Date()) {
  const settings = await prisma.userSettings.findUnique({ where: { userId } });
  const timezone = settings?.timezone || "Asia/Dubai";
  const weekKey = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  const existing = await prisma.weeklyGrowthReview.findUnique({
    where: { userId_weekKey: { userId, weekKey } },
    include: { decisions: { orderBy: { priority: "asc" } } },
  });
  if (existing) return existing;

  const periodEnd = now;
  const periodStart = new Date(now.getTime() - 7 * DAY);
  const comparisonStart = new Date(now.getTime() - 14 * DAY);
  const strategy = await getContentStrategy(userId);

  const [snapshotRows, links, conversions, workflows, experimentViews, operations, health, campaignRows] = await Promise.all([
    prisma.socialPerformanceSnapshot.findMany({
      where: {
        userId,
        post: {
          status: "posted_manually",
          postedManuallyAt: { gte: comparisonStart, lte: periodEnd },
        },
      },
      include: {
        post: {
          select: {
            title: true,
            hook: true,
            contentType: true,
            angle: true,
            format: true,
            mediaTypeX: true,
            mediaTypeLinkedIn: true,
            postedManuallyAt: true,
            schedule: { select: { scheduledFor: true } },
            sources: { select: { source: { select: { provider: true, externalId: true, title: true } } } },
          },
        },
      },
      orderBy: { capturedAt: "desc" },
      take: 2_000,
    }),
    prisma.trackedLink.findMany({
      where: { userId },
      include: {
        windows: { where: { bucketStart: { gte: periodStart, lte: periodEnd } } },
        campaignItem: { select: { stage: true } },
        experimentVariant: { select: { label: true } },
      },
    }),
    prisma.conversionEvent.findMany({
      where: { userId, occurredAt: { gte: periodStart, lte: periodEnd } },
    }),
    prisma.distributionWorkflow.findMany({
      where: { userId, post: { postedManuallyAt: { gte: periodStart, lte: periodEnd } } },
      select: { postId: true, platform: true, preEngagedAt: true },
    }),
    getExperimentViews(userId),
    prisma.operationalRun.findMany({
      where: { userId, startedAt: { gte: periodStart, lte: periodEnd } },
      include: { events: { select: { stage: true, durationMs: true } } },
    }),
    prisma.serviceHealthSnapshot.findMany({
      where: { userId },
      orderBy: { checkedAt: "desc" },
      take: 100,
    }),
    prisma.campaign.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        status: true,
        items: { select: { postId: true } },
      },
    }),
  ]);

  const allRecords = snapshotRows.map(performanceRecord);
  const currentRecords = allRecords.filter((record) => {
    const postedAt = record.post.postedManuallyAt;
    return postedAt && postedAt >= periodStart && postedAt <= periodEnd;
  });
  const previousRecords = allRecords.filter((record) => {
    const postedAt = record.post.postedManuallyAt;
    return postedAt && postedAt >= comparisonStart && postedAt < periodStart;
  });
  const currentLatest = buildPerformanceReport(currentRecords, timezone).latestRecords;
  const linkInputs = links.map((link) => ({
    id: link.id,
    platform: link.platform,
    postId: link.postId,
    clicksCount: link.windows.reduce((sum, window) => sum + window.countedClicks, 0),
    botHits: link.windows.reduce((sum, window) => sum + window.botHits, 0),
    ctaVariant: link.ctaVariant,
    ctaPlacement: link.ctaPlacement,
    stage: link.campaignItem?.stage ?? null,
    experimentVariant: link.experimentVariant?.label ?? null,
  }));
  const attribution = buildAttributionReport({
    links: linkInputs,
    snapshots: currentLatest,
    conversions: conversions.map((event) => ({
      trackedLinkId: event.trackedLinkId,
      postId: event.postId,
      platform: event.platform,
      value: event.value,
      eventType: event.eventType,
    })),
  });
  const distribution = buildDistributionComparison(workflows, currentLatest);
  const operationsReport = buildOperationsReport({ runs: operations, health, now: periodEnd, windowDays: 7 });
  const campaignByPost = new Map<string, string>();
  for (const campaign of campaignRows) {
    for (const item of campaign.items) if (item.postId) campaignByPost.set(item.postId, campaign.name);
  }
  const campaignMetrics = new Map<string, { impressions: number; engagements: number; followers: number; records: number }>();
  const campaignPostIds = new Set(campaignByPost.keys());
  for (const record of currentLatest) {
    const campaign = campaignByPost.get(record.postId);
    if (!campaign) continue;
    const value = campaignMetrics.get(campaign) ?? { impressions: 0, engagements: 0, followers: 0, records: 0 };
    value.impressions += record.impressions;
    value.engagements += record.likes + record.replies + record.reposts + record.saves + record.linkClicks;
    value.followers += record.followersBefore == null || record.followersAfter == null ? 0 : record.followersAfter - record.followersBefore;
    value.records += 1;
    campaignMetrics.set(campaign, value);
  }
  const bestCampaign = [...campaignMetrics.entries()].sort((a, b) => b[1].impressions - a[1].impressions)[0];
  const campaignRecords = currentLatest.filter((record) => campaignPostIds.has(record.postId));
  const isolatedRecords = currentLatest.filter((record) => !campaignPostIds.has(record.postId));
  const recordRate = (records: PerformanceRecord[]) => {
    const impressions = records.reduce((sum, record) => sum + record.impressions, 0);
    const engagements = records.reduce((sum, record) => sum + record.likes + record.replies + record.reposts + record.saves + record.linkClicks, 0);
    return impressions > 0 ? Math.round((engagements / impressions) * 10_000) / 100 : 0;
  };

  const evidence: WeeklyReviewEvidence = {
    current: periodPerformance(currentRecords, timezone),
    previous: periodPerformance(previousRecords, timezone),
    attribution: {
      impressions: attribution.funnel.impressions,
      clicks: attribution.funnel.clicks,
      conversions: attribution.funnel.conversions,
      clickRate: attribution.funnel.clickRate,
      conversionRate: attribution.funnel.conversionRate,
    },
    experiments: {
      total: experimentViews.length,
      active: experimentViews.filter((item) => item.status === "active").length,
      completed: experimentViews.filter((item) => item.status === "completed").length,
      winners: experimentViews.filter((item) => item.result.status === "winner").length,
      collecting: experimentViews.filter((item) => item.result.status === "collecting").length,
    },
    distribution: {
      assistedPosts: distribution.assisted.records,
      baselinePosts: distribution.baseline.records,
      assistedEngagementRate: distribution.assisted.engagementRate,
      baselineEngagementRate: distribution.baseline.engagementRate,
    },
    campaigns: {
      active: campaignRows.filter((item) => item.status === "active").length,
      tracked: campaignMetrics.size,
      impressions: [...campaignMetrics.values()].reduce((sum, item) => sum + item.impressions, 0),
      followersGained: [...campaignMetrics.values()].reduce((sum, item) => sum + item.followers, 0),
      bestCampaign: bestCampaign?.[0] ?? null,
      campaignPosts: new Set(campaignRecords.map((record) => record.postId)).size,
      isolatedPosts: new Set(isolatedRecords.map((record) => record.postId)).size,
      campaignEngagementRate: recordRate(campaignRecords),
      isolatedEngagementRate: recordRate(isolatedRecords),
    },
    operations: {
      totalRuns: operationsReport.totalRuns,
      successRate: operationsReport.successRate,
      failedRuns: operationsReport.failedRuns,
      unhealthyServices: operationsReport.latestHealth.filter((item) => item.status === "unhealthy").map((item) => item.service),
    },
    contentMix: strategy.contentMix,
  };
  const draft = buildWeeklyReview(evidence);
  return prisma.weeklyGrowthReview.create({
    data: {
      userId,
      weekKey,
      periodStart,
      periodEnd,
      comparisonStart,
      timezone,
      evidenceJson: JSON.stringify(evidence),
      summaryJson: JSON.stringify({ headline: draft.headline, ...draft.summary }),
      nextWeekBriefJson: JSON.stringify(draft.nextWeekBrief),
      decisions: {
        create: draft.decisions.map((decision) => ({
          category: decision.category,
          priority: decision.priority,
          title: decision.title,
          rationale: decision.rationale,
          confidence: decision.confidence,
          evidenceJson: JSON.stringify(decision.evidence),
          actionJson: JSON.stringify(decision.action),
        })),
      },
    },
    include: { decisions: { orderBy: { priority: "asc" } } },
  });
}

export async function decideWeeklyGrowthDecision(
  userId: string,
  reviewId: string,
  decisionId: string,
  choice: "apply" | "reject",
) {
  const decision = await prisma.weeklyGrowthDecision.findFirst({
    where: { id: decisionId, reviewId, review: { userId } },
    include: { review: true },
  });
  if (!decision) throw new Error("Weekly decision not found");
  if (decision.status !== "pending") throw new Error("Weekly decision was already decided");
  const now = new Date();
  if (choice === "reject") {
    await prisma.weeklyGrowthDecision.update({
      where: { id: decision.id },
      data: { status: "rejected", decidedAt: now, appliedResultJson: JSON.stringify({ changed: false }) },
    });
  } else {
    const action = parseAction(decision.actionJson);
    let result: Record<string, unknown> = { changed: false, action: action.type };
    if (action.type === "adjust_content_mix") {
      const strategy = await prisma.contentStrategy.findUnique({ where: { userId } });
      if (!strategy) throw new Error("Content strategy not found");
      const currentMix = JSON.parse(strategy.contentMixJson) as Array<{ type: string; weight: number }>;
      if (!sameMix(currentMix, action.expectedMix)) {
        throw new Error("Content mix changed after this review. Generate a fresh review before applying it.");
      }
      await prisma.contentStrategy.update({
        where: { userId },
        data: { contentMixJson: JSON.stringify(action.proposedMix) },
      });
      result = { changed: true, action: action.type, contentMix: action.proposedMix };
    } else if (action.type === "create_experiment") {
      const existing = await prisma.growthExperiment.findFirst({
        where: { userId, platform: action.platform, dimension: action.dimension, status: { in: ["draft", "active"] } },
      });
      if (existing) throw new Error(`A ${action.dimension.replaceAll("_", " ")} experiment is already draft or active on ${action.platform}.`);
      const definition = EXPERIMENT_DIMENSIONS[action.dimension];
      const experiment = await prisma.growthExperiment.create({
        data: {
          userId,
          name: action.name,
          hypothesis: action.hypothesis,
          platform: action.platform,
          dimension: action.dimension,
          primaryMetric: action.primaryMetric,
          minSamplePerVariant: action.minSamplePerVariant,
          status: "draft",
          variants: {
            create: definition.variants.map((variant) => ({
              key: variant.key,
              label: variant.label,
              configJson: JSON.stringify(variant.config),
            })),
          },
        },
      });
      result = { changed: true, action: action.type, experimentId: experiment.id, status: "draft" };
    }
    await prisma.weeklyGrowthDecision.update({
      where: { id: decision.id },
      data: { status: "applied", decidedAt: now, appliedResultJson: JSON.stringify(result) },
    });
  }

  const pending = await prisma.weeklyGrowthDecision.count({ where: { reviewId, status: "pending" } });
  if (pending === 0) {
    await prisma.weeklyGrowthReview.update({ where: { id: reviewId }, data: { status: "reviewed", reviewedAt: now } });
  }
  return prisma.weeklyGrowthReview.findFirst({
    where: { id: reviewId, userId },
    include: { decisions: { orderBy: { priority: "asc" } } },
  });
}
