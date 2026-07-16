import type { ExperimentMetric, ExperimentPlatform } from "@/lib/experiments/definitions";

export interface ExperimentPerformanceInput {
  id: string;
  postId: string;
  platform: ExperimentPlatform;
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
}

export interface ExperimentVariantInput {
  id: string;
  key: string;
  label: string;
  configJson: string;
  assignedPosts: number;
  performance: ExperimentPerformanceInput[];
}

export interface VariantResult {
  id: string;
  key: string;
  label: string;
  configJson: string;
  assignedPosts: number;
  sampleSize: number;
  impressions: number;
  engagements: number;
  replies: number;
  saves: number;
  profileVisits: number;
  linkClicks: number;
  followersGained: number;
  metricValue: number;
}

export interface ExperimentResult {
  status: "collecting" | "inconclusive" | "winner";
  metric: ExperimentMetric;
  platform: ExperimentPlatform;
  minSamplePerVariant: number;
  variants: VariantResult[];
  winner: VariantResult | null;
  runnerUp: VariantResult | null;
  rationale: string;
}

function safe(value: number): number {
  return Math.max(0, Number.isFinite(value) ? value : 0);
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100_000) / 1_000;
}

function latest(records: ExperimentPerformanceInput[]): ExperimentPerformanceInput[] {
  const byPost = new Map<string, ExperimentPerformanceInput>();
  for (const record of records) {
    const current = byPost.get(record.postId);
    if (!current || record.capturedAt > current.capturedAt) byPost.set(record.postId, record);
  }
  return [...byPost.values()];
}

function metricValue(metric: ExperimentMetric, totals: Omit<VariantResult, "metricValue">): number {
  if (metric === "reply_rate") return rate(totals.replies, totals.impressions);
  if (metric === "save_rate") return rate(totals.saves, totals.impressions);
  if (metric === "profile_visit_rate") return rate(totals.profileVisits, totals.impressions);
  if (metric === "follow_conversion") {
    return rate(totals.followersGained, totals.profileVisits);
  }
  if (metric === "link_click_rate") return rate(totals.linkClicks, totals.impressions);
  return rate(totals.engagements, totals.impressions);
}

function summarize(
  variant: ExperimentVariantInput,
  metric: ExperimentMetric,
  platform: ExperimentPlatform,
): VariantResult {
  const records = latest(variant.performance.filter((record) => record.platform === platform));
  const base = {
    id: variant.id,
    key: variant.key,
    label: variant.label,
    configJson: variant.configJson,
    assignedPosts: variant.assignedPosts,
    sampleSize: records.length,
    impressions: records.reduce((sum, row) => sum + safe(row.impressions), 0),
    engagements: records.reduce(
      (sum, row) =>
        sum + safe(row.likes) + safe(row.replies) + safe(row.reposts) + safe(row.saves) + safe(row.linkClicks),
      0,
    ),
    replies: records.reduce((sum, row) => sum + safe(row.replies), 0),
    saves: records.reduce((sum, row) => sum + safe(row.saves), 0),
    profileVisits: records.reduce((sum, row) => sum + safe(row.profileVisits), 0),
    linkClicks: records.reduce((sum, row) => sum + safe(row.linkClicks), 0),
    followersGained: records.reduce((sum, row) => {
      if (row.followersBefore == null || row.followersAfter == null) return sum;
      return sum + (row.followersAfter - row.followersBefore);
    }, 0),
  };
  return { ...base, metricValue: metricValue(metric, base) };
}

export function analyzeExperiment(input: {
  variants: ExperimentVariantInput[];
  metric: ExperimentMetric;
  platform: ExperimentPlatform;
  minSamplePerVariant: number;
}): ExperimentResult {
  const minimum = Math.max(2, Math.min(50, Math.round(input.minSamplePerVariant)));
  const variants = input.variants
    .map((variant) => summarize(variant, input.metric, input.platform))
    .sort((left, right) => right.metricValue - left.metricValue);
  const missing = variants.filter((variant) => variant.sampleSize < minimum);
  if (variants.length < 2 || missing.length) {
    const needed = missing
      .map((variant) => `${variant.label}: ${Math.max(0, minimum - variant.sampleSize)} more`)
      .join(" · ");
    return {
      status: "collecting",
      metric: input.metric,
      platform: input.platform,
      minSamplePerVariant: minimum,
      variants,
      winner: null,
      runnerUp: null,
      rationale: needed || "At least two variants are required.",
    };
  }

  const winner = variants[0]!;
  const runnerUp = variants[1]!;
  const absoluteLift = winner.metricValue - runnerUp.metricValue;
  const relativeLift = runnerUp.metricValue > 0 ? absoluteLift / runnerUp.metricValue : absoluteLift > 0 ? 1 : 0;
  if (absoluteLift < 0.1 && relativeLift < 0.1) {
    return {
      status: "inconclusive",
      metric: input.metric,
      platform: input.platform,
      minSamplePerVariant: minimum,
      variants,
      winner: null,
      runnerUp,
      rationale: "The variants are too close to recommend a durable strategy change. Keep collecting comparable snapshots.",
    };
  }

  return {
    status: "winner",
    metric: input.metric,
    platform: input.platform,
    minSamplePerVariant: minimum,
    variants,
    winner,
    runnerUp,
    rationale: `${winner.label} leads ${runnerUp.label} by ${absoluteLift.toFixed(2)} percentage points on ${input.platform.toUpperCase()} across ${winner.sampleSize} versus ${runnerUp.sampleSize} measured posts.`,
  };
}

