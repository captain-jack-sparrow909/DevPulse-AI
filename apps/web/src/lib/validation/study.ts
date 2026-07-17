export interface ValidationSnapshot {
  postId: string;
  platform: string;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  saves: number;
  profileVisits: number;
  linkClicks: number;
}

export interface ValidationPublication {
  postId: string;
  platform: string;
}

export interface ValidationFollowerPoint {
  platform: string;
  followers: number;
  capturedAt: Date;
}

export interface PlatformValidationMetrics {
  published: number;
  measured: number;
  impressions: number;
  engagements: number;
  engagementRate: number;
  profileVisits: number;
  linkClicks: number;
  followerGrowth: number | null;
}

export interface ValidationMetrics {
  x: PlatformValidationMetrics;
  linkedin: PlatformValidationMetrics;
  measurementCoverage: number;
  totalPublished: number;
  totalMeasured: number;
}

export interface ValidationRecommendation {
  category: "measurement" | "cadence" | "quality" | "growth";
  severity: "info" | "attention" | "positive";
  title: string;
  rationale: string;
  action: string;
}

const DAY = 24 * 60 * 60 * 1000;

export function buildCheckpointSchedule(start: Date) {
  return [
    { sequence: 0, label: "Baseline", days: 0 },
    { sequence: 1, label: "Day 7", days: 7 },
    { sequence: 2, label: "Day 14", days: 14 },
    { sequence: 3, label: "Day 21", days: 21 },
    { sequence: 4, label: "Day 30", days: 30 },
  ].map((item) => ({
    ...item,
    scheduledFor: new Date(start.getTime() + item.days * DAY),
  }));
}

function emptyPlatform(): PlatformValidationMetrics {
  return { published: 0, measured: 0, impressions: 0, engagements: 0, engagementRate: 0, profileVisits: 0, linkClicks: 0, followerGrowth: null };
}

export function aggregateValidationMetrics(input: {
  snapshots: ValidationSnapshot[];
  publications: ValidationPublication[];
  followerPoints: ValidationFollowerPoint[];
}): ValidationMetrics {
  const result = { x: emptyPlatform(), linkedin: emptyPlatform() };
  const platforms = ["x", "linkedin"] as const;

  for (const platform of platforms) {
    const publications = new Set(input.publications.filter((item) => item.platform === platform).map((item) => item.postId));
    const snapshots = input.snapshots.filter((item) => item.platform === platform);
    const measured = new Set(snapshots.map((item) => item.postId));
    const target = result[platform];
    target.published = publications.size;
    target.measured = measured.size;
    for (const snapshot of snapshots) {
      target.impressions += snapshot.impressions;
      target.engagements += snapshot.likes + snapshot.replies + snapshot.reposts + snapshot.saves;
      target.profileVisits += snapshot.profileVisits;
      target.linkClicks += snapshot.linkClicks;
    }
    target.engagementRate = target.impressions > 0
      ? Number(((target.engagements / target.impressions) * 100).toFixed(2))
      : 0;
    const followers = input.followerPoints
      .filter((item) => item.platform === platform)
      .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    if (followers.length >= 2) target.followerGrowth = followers.at(-1)!.followers - followers[0].followers;
  }

  const totalPublished = result.x.published + result.linkedin.published;
  const totalMeasured = result.x.measured + result.linkedin.measured;
  return {
    ...result,
    totalPublished,
    totalMeasured,
    measurementCoverage: totalPublished > 0 ? Number(((totalMeasured / totalPublished) * 100).toFixed(1)) : 0,
  };
}

export function recommendValidationActions(input: {
  baseline: ValidationMetrics;
  current: ValidationMetrics;
  elapsedDays: number;
  xPostsPerDay: number;
  linkedInPostsPerWeek: number;
}): ValidationRecommendation[] {
  const recommendations: ValidationRecommendation[] = [];
  const { baseline, current } = input;

  if (current.measurementCoverage < 80) {
    recommendations.push({
      category: "measurement",
      severity: "attention",
      title: "Improve measurement coverage before tuning",
      rationale: `${current.measurementCoverage}% of published platform posts have comparable metrics; 80% is required for reliable decisions.`,
      action: "Capture 24h or 72h metrics and follower checkpoints for missing publications.",
    });
  }

  const expectedX = Math.floor(input.elapsedDays * input.xPostsPerDay * 0.7);
  const expectedLinkedIn = Math.floor((input.elapsedDays / 7) * input.linkedInPostsPerWeek * 0.7);
  if (input.elapsedDays >= 7 && (current.x.published < expectedX || current.linkedin.published < expectedLinkedIn)) {
    recommendations.push({
      category: "cadence",
      severity: "attention",
      title: "Execution is below the planned cadence",
      rationale: `Published ${current.x.published} X and ${current.linkedin.published} LinkedIn posts versus a 70% adherence floor of ${expectedX} and ${expectedLinkedIn}.`,
      action: "Fix the manual publishing workflow before changing quality thresholds or cooldowns.",
    });
  }

  for (const platform of ["x", "linkedin"] as const) {
    const sample = current[platform];
    const prior = baseline[platform];
    if (sample.measured < 5 || sample.impressions < 500) continue;
    if (prior.engagementRate > 0 && sample.engagementRate < prior.engagementRate * 0.9) {
      recommendations.push({
        category: "quality",
        severity: "attention",
        title: `Test one ${platform === "x" ? "X" : "LinkedIn"} quality change`,
        rationale: `Engagement rate is ${sample.engagementRate}% versus a ${prior.engagementRate}% baseline across ${sample.measured} measured posts.`,
        action: "Run a controlled hook or format experiment; keep cadence and cooldowns unchanged during the test.",
      });
    } else if (prior.engagementRate > 0 && sample.engagementRate >= prior.engagementRate * 1.1) {
      recommendations.push({
        category: "quality",
        severity: "positive",
        title: `Keep the current ${platform === "x" ? "X" : "LinkedIn"} quality gate`,
        rationale: `Engagement rate improved to ${sample.engagementRate}% from ${prior.engagementRate}% with sufficient sample size.`,
        action: "Keep the current threshold and cooldown for the next validation window.",
      });
    }
    if ((sample.followerGrowth ?? 0) > 0) {
      recommendations.push({
        category: "growth",
        severity: "positive",
        title: `${platform === "x" ? "X" : "LinkedIn"} follower growth is positive`,
        rationale: `Follower checkpoints show a net gain of ${sample.followerGrowth}.`,
        action: "Preserve the current positioning and continue collecting checkpoint evidence.",
      });
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      category: "measurement",
      severity: "info",
      title: "Keep collecting evidence",
      rationale: "The study has not reached the minimum sample needed for a defensible strategy change.",
      action: "Continue the approved cadence and capture the next scheduled checkpoint.",
    });
  }
  return recommendations;
}
