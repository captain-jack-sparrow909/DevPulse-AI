import assert from "node:assert/strict";
import test from "node:test";
import type { PerformanceBreakdown, PerformanceSummary } from "@/lib/analytics/performance";
import { DEFAULT_CONTENT_STRATEGY } from "@/lib/content/strategy";
import { buildWeeklyReview, type WeeklyReviewEvidence } from "@/lib/growth-review/engine";
import { weeklyReviewCsv, weeklyReviewPdf } from "@/lib/growth-review/export";

function summary(overrides: Partial<PerformanceSummary> = {}): PerformanceSummary {
  return {
    trackedPosts: 0,
    platformSnapshots: 0,
    impressions: 0,
    engagements: 0,
    engagementRate: 0,
    replies: 0,
    reposts: 0,
    saves: 0,
    profileVisits: 0,
    linkClicks: 0,
    followersGained: 0,
    ...overrides,
  };
}

function group(key: string, posts: number, engagementRate: number, impressions = 1_000): PerformanceBreakdown {
  return { key, label: key.replaceAll("_", " "), posts, impressions, engagements: Math.round(impressions * engagementRate / 100), engagementRate, followersGained: 0 };
}

function evidence(overrides: Partial<WeeklyReviewEvidence> = {}): WeeklyReviewEvidence {
  return {
    current: { summary: summary(), byPlatform: [], byContentType: [], byProject: [], byMediaType: [] },
    previous: { summary: summary(), byPlatform: [], byContentType: [], byProject: [], byMediaType: [] },
    attribution: { impressions: 0, clicks: 0, conversions: 0, clickRate: 0, conversionRate: 0 },
    experiments: { total: 0, active: 0, completed: 0, winners: 0, collecting: 0 },
    distribution: { assistedPosts: 0, baselinePosts: 0, assistedEngagementRate: 0, baselineEngagementRate: 0 },
    campaigns: { active: 0, tracked: 0, impressions: 0, followersGained: 0, bestCampaign: null, campaignPosts: 0, isolatedPosts: 0, campaignEngagementRate: 0, isolatedEngagementRate: 0 },
    operations: { totalRuns: 5, successRate: 100, failedRuns: 0, unhealthyServices: [] },
    contentMix: DEFAULT_CONTENT_STRATEGY.contentMix,
    ...overrides,
  };
}

test("sparse reviews always produce continue, reduce, and test without mutating strategy", () => {
  const review = buildWeeklyReview(evidence());
  assert.deepEqual(review.decisions.map((item) => item.category), ["continue", "reduce", "test"]);
  assert.equal(review.decisions[1]?.action.type, "hold_mix");
  assert.equal(review.decisions[2]?.action.type, "collect_metrics");
  assert.equal(review.summary.dataConfidence, "low");
});

test("a large repeated gap proposes a one-slot content mix shift", () => {
  const review = buildWeeklyReview(evidence({
    current: {
      summary: summary({ trackedPosts: 12, platformSnapshots: 20, impressions: 8_000, engagements: 240, engagementRate: 3 }),
      byPlatform: [group("x", 6, 2), group("linkedin", 6, 4)],
      byContentType: [group("project_lesson", 6, 4), group("architecture_breakdown", 4, 1)],
      byProject: [],
      byMediaType: [],
    },
  }));
  const action = review.decisions[1]?.action;
  assert.equal(action?.type, "adjust_content_mix");
  if (action?.type !== "adjust_content_mix") return;
  assert.equal(action.proposedMix.find((item) => item.type === "project_lesson")?.weight, 6);
  assert.equal(action.proposedMix.find((item) => item.type === "architecture_breakdown")?.weight, 1);
});

test("a weak tracked-link funnel proposes a draft CTA experiment", () => {
  const review = buildWeeklyReview(evidence({
    current: {
      summary: summary({ trackedPosts: 8, platformSnapshots: 12, impressions: 4_000, engagements: 100, engagementRate: 2.5 }),
      byPlatform: [group("x", 4, 2), group("linkedin", 4, 3)],
      byContentType: [group("project_lesson", 4, 3)],
      byProject: [],
      byMediaType: [],
    },
    attribution: { impressions: 2_000, clicks: 4, conversions: 0, clickRate: 0.2, conversionRate: 0 },
  }));
  const action = review.decisions[2]?.action;
  assert.equal(action?.type, "create_experiment");
  if (action?.type !== "create_experiment") return;
  assert.equal(action.dimension, "cta_pattern");
  assert.equal(action.primaryMetric, "link_click_rate");
});

test("weekly review exports produce inspectable CSV and PDF files", async () => {
  const record = {
    weekKey: "2026-07-17",
    periodStart: new Date("2026-07-10T00:00:00Z"),
    periodEnd: new Date("2026-07-17T00:00:00Z"),
    timezone: "Asia/Dubai",
    status: "draft",
    summaryJson: JSON.stringify({ headline: "Engagement is steady", trackedPosts: 8, impressions: 4000, engagementRate: 2.5, followersGained: 2, dataConfidence: "medium" }),
    nextWeekBriefJson: JSON.stringify({ focus: "Continue project lessons", guardrail: "Hold mix", experiment: "Test hooks", measurement: ["Capture metrics"], reliabilityNote: "Healthy" }),
    decisions: [{ priority: 1, category: "continue", title: "Continue project lessons", rationale: "Repeated evidence.", confidence: "medium", status: "pending" }],
  };
  const csv = weeklyReviewCsv(record);
  assert.match(csv, /Continue project lessons/);
  const pdf = await weeklyReviewPdf(record);
  assert.equal(Buffer.from(pdf).subarray(0, 4).toString(), "%PDF");
});
