import type {
  PerformanceBreakdown,
  PerformanceSummary,
} from "@/lib/analytics/performance";
import type { ContentMixItem, ContentType } from "@/lib/content/strategy";
import type {
  ExperimentDimension,
  ExperimentMetric,
  ExperimentPlatform,
} from "@/lib/experiments/definitions";

export type ReviewDecisionCategory = "continue" | "reduce" | "test";
export type ReviewConfidence = "low" | "medium" | "high";

export interface ReviewPeriodPerformance {
  summary: PerformanceSummary;
  byPlatform: PerformanceBreakdown[];
  byContentType: PerformanceBreakdown[];
  byProject: PerformanceBreakdown[];
  byMediaType: PerformanceBreakdown[];
}

export interface WeeklyReviewEvidence {
  measurement: {
    due24h: number;
    completed24h: number;
    comparableCoverage: number;
    comparablePosts: number;
    confidence: ReviewConfidence;
    alerts: number;
  };
  current: ReviewPeriodPerformance;
  previous: ReviewPeriodPerformance;
  attribution: {
    impressions: number;
    clicks: number;
    conversions: number;
    clickRate: number;
    conversionRate: number;
  };
  experiments: {
    total: number;
    active: number;
    completed: number;
    winners: number;
    collecting: number;
  };
  distribution: {
    assistedPosts: number;
    baselinePosts: number;
    assistedEngagementRate: number;
    baselineEngagementRate: number;
  };
  campaigns: {
    active: number;
    tracked: number;
    impressions: number;
    followersGained: number;
    bestCampaign: string | null;
    campaignPosts: number;
    isolatedPosts: number;
    campaignEngagementRate: number;
    isolatedEngagementRate: number;
  };
  operations: {
    totalRuns: number;
    successRate: number;
    failedRuns: number;
    unhealthyServices: string[];
  };
  contentMix: ContentMixItem[];
}

export type WeeklyReviewAction =
  | { type: "retain_focus"; contentType: ContentType | null }
  | { type: "hold_mix"; reason: string }
  | {
      type: "adjust_content_mix";
      reduceType: ContentType;
      increaseType: ContentType;
      expectedMix: ContentMixItem[];
      proposedMix: ContentMixItem[];
    }
  | { type: "collect_metrics"; targetPosts: number; currentPosts: number }
  | {
      type: "create_experiment";
      name: string;
      hypothesis: string;
      dimension: ExperimentDimension;
      platform: ExperimentPlatform;
      primaryMetric: ExperimentMetric;
      minSamplePerVariant: number;
    };

type WeeklyReviewTestAction = Extract<
  WeeklyReviewAction,
  { type: "collect_metrics" } | { type: "create_experiment" }
>;

export interface WeeklyReviewDecisionDraft {
  category: ReviewDecisionCategory;
  priority: number;
  title: string;
  rationale: string;
  confidence: ReviewConfidence;
  evidence: Record<string, unknown>;
  action: WeeklyReviewAction;
}

export interface NextWeekBrief {
  focus: string;
  guardrail: string;
  experiment: string;
  measurement: string[];
  reliabilityNote: string;
}

export interface WeeklyReviewDraft {
  headline: string;
  summary: {
    trackedPosts: number;
    impressions: number;
    engagementRate: number;
    followersGained: number;
    engagementRateDelta: number;
    impressionDeltaPercent: number | null;
    dataConfidence: ReviewConfidence;
  };
  decisions: WeeklyReviewDecisionDraft[];
  nextWeekBrief: NextWeekBrief;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return current > 0 ? null : 0;
  return round(((current - previous) / previous) * 100, 1);
}

function repeated(groups: PerformanceBreakdown[]): PerformanceBreakdown[] {
  return groups.filter((group) => group.posts >= 3 && group.impressions >= 100);
}

function asContentType(value: string): ContentType | null {
  return [
    "project_lesson",
    "architecture_breakdown",
    "evidence_opinion",
    "experiment_benchmark",
    "curated_discovery",
  ].includes(value)
    ? (value as ContentType)
    : null;
}

function proposeMixChange(
  mix: ContentMixItem[],
  strongest: PerformanceBreakdown | undefined,
  weakest: PerformanceBreakdown | undefined,
): WeeklyReviewAction | null {
  const increaseType = strongest ? asContentType(strongest.key) : null;
  const reduceType = weakest ? asContentType(weakest.key) : null;
  if (!strongest || !weakest || !increaseType || !reduceType || increaseType === reduceType) return null;
  if (weakest.engagementRate > strongest.engagementRate * 0.7) return null;
  const reduced = mix.find((item) => item.type === reduceType);
  const increased = mix.find((item) => item.type === increaseType);
  if (!reduced || !increased || reduced.weight <= 1) return null;
  const proposedMix = mix.map((item) => {
    if (item.type === reduceType) return { ...item, weight: item.weight - 1 };
    if (item.type === increaseType) return { ...item, weight: item.weight + 1 };
    return { ...item };
  });
  return {
    type: "adjust_content_mix",
    reduceType,
    increaseType,
    expectedMix: mix.map((item) => ({ ...item })),
    proposedMix,
  };
}

function testAction(evidence: WeeklyReviewEvidence): WeeklyReviewTestAction {
  const current = evidence.current.summary;
  if (current.trackedPosts < 6) {
    return { type: "collect_metrics", targetPosts: 6, currentPosts: current.trackedPosts };
  }

  const weakestPlatform = [...evidence.current.byPlatform]
    .filter((item) => item.posts >= 2)
    .sort((a, b) => a.engagementRate - b.engagementRate)[0];
  const platform: ExperimentPlatform = weakestPlatform?.key === "linkedin" ? "linkedin" : "x";

  if (evidence.attribution.impressions >= 500 && evidence.attribution.clickRate < 0.5) {
    return {
      type: "create_experiment",
      name: "CTA pattern: direct value vs question led",
      hypothesis: "A more explicit value promise will improve qualified link clicks without reducing conversation quality.",
      dimension: "cta_pattern",
      platform,
      primaryMetric: "link_click_rate",
      minSamplePerVariant: 3,
    };
  }
  if (current.profileVisits >= 10 && current.followersGained <= 0) {
    return {
      type: "create_experiment",
      name: "Ending pattern: takeaway vs focused question",
      hypothesis: "A consistent practical takeaway will convert more profile interest into followers than a generic ending.",
      dimension: "ending_pattern",
      platform,
      primaryMetric: "follow_conversion",
      minSamplePerVariant: 3,
    };
  }
  if (current.engagementRate < 1.5) {
    return {
      type: "create_experiment",
      name: "Hook pattern: build decision vs technical tension",
      hypothesis: "A concrete technical tension in the opening will earn more replies and engagement than a descriptive project introduction.",
      dimension: "hook_pattern",
      platform,
      primaryMetric: "engagement_rate",
      minSamplePerVariant: 3,
    };
  }
  return {
    type: "create_experiment",
    name: "Media type: text vs branded technical card",
    hypothesis: "A branded technical card will improve qualified engagement compared with text-only posts using the same editorial approach.",
    dimension: "media_type",
    platform,
    primaryMetric: "engagement_rate",
    minSamplePerVariant: 3,
  };
}

export function buildWeeklyReview(evidence: WeeklyReviewEvidence): WeeklyReviewDraft {
  const current = evidence.current.summary;
  const previous = evidence.previous.summary;
  const repeatedTypes = repeated(evidence.current.byContentType);
  const strongest = repeatedTypes[0];
  const weakest = [...repeatedTypes].sort((a, b) => a.engagementRate - b.engagementRate)[0];
  const bestType = strongest ? asContentType(strongest.key) : null;
  const mixAction = proposeMixChange(evidence.contentMix, strongest, weakest);
  const confidence: ReviewConfidence = evidence.measurement.confidence;

  const continueDecision: WeeklyReviewDecisionDraft = strongest
    ? {
        category: "continue",
        priority: 1,
        title: `Continue ${strongest.label} for one more measured cycle`,
        rationale: `${strongest.label} leads the repeated content lanes at ${strongest.engagementRate.toFixed(2)}% engagement across ${strongest.posts} tracked posts. Continue it, but require new evidence and a non-repeated hook.`,
        confidence: strongest.posts >= 5 ? "high" : "medium",
        evidence: {
          contentType: strongest.key,
          posts: strongest.posts,
          impressions: strongest.impressions,
          engagementRate: strongest.engagementRate,
          followersGained: strongest.followersGained,
        },
        action: { type: "retain_focus", contentType: bestType },
      }
    : {
        category: "continue",
        priority: 1,
        title: "Continue the current mix while the sample matures",
        rationale: "No content lane has at least three posts and 100 impressions in this window, so declaring a winner would be premature.",
        confidence: "low",
        evidence: { trackedPosts: current.trackedPosts, minimumPostsPerLane: 3 },
        action: { type: "retain_focus", contentType: null },
      };

  const reduceDecision: WeeklyReviewDecisionDraft = mixAction?.type === "adjust_content_mix"
    ? {
        category: "reduce",
        priority: 2,
        title: `Reduce ${weakest.label}; shift one slot to ${strongest.label}`,
        rationale: `${weakest.label} trails the strongest repeated lane by ${round(strongest.engagementRate - weakest.engagementRate)} percentage points. The proposed change moves only one slot and preserves every editorial lane.`,
        confidence: weakest.posts >= 5 && strongest.posts >= 5 ? "high" : "medium",
        evidence: {
          weaker: { key: weakest.key, posts: weakest.posts, engagementRate: weakest.engagementRate },
          stronger: { key: strongest.key, posts: strongest.posts, engagementRate: strongest.engagementRate },
        },
        action: mixAction,
      }
    : {
        category: "reduce",
        priority: 2,
        title: "Do not reduce a content lane yet",
        rationale: "The repeated lanes do not have a large enough, safe-to-act-on gap, or the weakest lane is already at its minimum weight. Keep the mix stable and collect comparable 24-hour snapshots.",
        confidence: "low",
        evidence: {
          repeatedLanes: repeatedTypes.map((item) => ({ key: item.key, posts: item.posts, engagementRate: item.engagementRate })),
          threshold: "3 posts, 100 impressions, and at least a 30% relative gap",
        },
        action: { type: "hold_mix", reason: "Insufficient repeated evidence for a safe weight change." },
      };

  const proposedTest = testAction(evidence);
  const testDecision: WeeklyReviewDecisionDraft = proposedTest.type === "collect_metrics"
    ? {
        category: "test",
        priority: 3,
        title: `Capture ${Math.max(0, proposedTest.targetPosts - proposedTest.currentPosts)} more measured post(s) before starting a test`,
        rationale: "An experiment would consume scarce posts without enough baseline data. Record both platforms at a consistent post age first.",
        confidence: "low",
        evidence: { trackedPosts: current.trackedPosts, targetPosts: proposedTest.targetPosts },
        action: proposedTest,
      }
    : {
        category: "test",
        priority: 3,
        title: `Test ${proposedTest.dimension.replaceAll("_", " ")} on ${proposedTest.platform}`,
        rationale: proposedTest.hypothesis,
        confidence: confidence === "high" ? "high" : "medium",
        evidence: {
          engagementRate: current.engagementRate,
          profileVisits: current.profileVisits,
          followersGained: current.followersGained,
          attribution: evidence.attribution,
          activeExperiments: evidence.experiments.active,
          distribution: evidence.distribution,
          campaignComparison: evidence.campaigns,
        },
        action: proposedTest,
      };

  const engagementRateDelta = round(current.engagementRate - previous.engagementRate);
  const impressionDeltaPercent = percentChange(current.impressions, previous.impressions);
  const trend = engagementRateDelta > 0.2 ? "improving" : engagementRateDelta < -0.2 ? "declining" : "steady";
  const reliabilityNote = evidence.operations.totalRuns === 0
    ? "No operational runs were observed; verify cron and health checks before increasing volume."
    : evidence.operations.successRate < 90 || evidence.operations.unhealthyServices.length > 0
      ? `Reliability is a constraint: ${evidence.operations.successRate.toFixed(1)}% success and ${evidence.operations.unhealthyServices.length} unhealthy service(s).`
      : `Operations are supporting the plan at ${evidence.operations.successRate.toFixed(1)}% success.`;

  return {
    headline: `Engagement is ${trend}; ${current.trackedPosts} posts provide ${confidence}-confidence evidence.`,
    summary: {
      trackedPosts: current.trackedPosts,
      impressions: current.impressions,
      engagementRate: current.engagementRate,
      followersGained: current.followersGained,
      engagementRateDelta,
      impressionDeltaPercent,
      dataConfidence: confidence,
    },
    decisions: [continueDecision, reduceDecision, testDecision],
    nextWeekBrief: {
      focus: continueDecision.title,
      guardrail: reduceDecision.title,
      experiment: testDecision.title,
      measurement: [
        "Capture X and LinkedIn metrics at a consistent 24-hour post age.",
        `Comparable 24-hour coverage is ${evidence.measurement.comparableCoverage.toFixed(1)}% (${evidence.measurement.completed24h}/${evidence.measurement.due24h} due checkpoints).`,
        "Record impressions, engagement, profile visits, link clicks, and follower before/after counts.",
        "Use tracked links for product CTAs and record explicit conversion events instead of inferring outcomes.",
        evidence.distribution.assistedPosts && evidence.distribution.baselinePosts
          ? `Distribution evidence: assisted posts are at ${evidence.distribution.assistedEngagementRate.toFixed(2)}% engagement versus ${evidence.distribution.baselineEngagementRate.toFixed(2)}% baseline.`
          : "Record both assisted and baseline distribution cycles before attributing lift to pre-engagement.",
        evidence.campaigns.campaignPosts && evidence.campaigns.isolatedPosts
          ? `Campaign evidence: campaign posts are at ${evidence.campaigns.campaignEngagementRate.toFixed(2)}% engagement versus ${evidence.campaigns.isolatedEngagementRate.toFixed(2)}% for isolated posts.`
          : "Track both campaign and isolated posts before treating narrative sequencing as a growth driver.",
      ],
      reliabilityNote,
    },
  };
}
