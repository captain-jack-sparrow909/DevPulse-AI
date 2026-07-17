import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export type PublishingPlatform = "x" | "linkedin";

export interface AdaptiveCadenceSettings {
  adaptiveCadenceEnabled: boolean;
  postsPerDay: number;
  xPostsPerDay: number;
  linkedInPostsPerWeek: number;
  qualityThreshold: number;
  minimumNovelty: number;
  projectCooldownHours: number;
  contentTypeCooldownHours: number;
}

export interface PublishingCandidate {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
  scheduledFor: Date | null;
  scoreOverall: number | null;
  scoreNovelty: number | null;
  scoreEngagement: number | null;
  scoreHook: number | null;
  contentType: string | null;
  topicId: string | null;
  projectKey: string | null;
  hasEvidence: boolean;
  hasX: boolean;
  hasLinkedIn: boolean;
}

export interface RecentPublication {
  postId: string;
  platform: PublishingPlatform;
  publishedAt: Date;
  contentType: string | null;
  topicId: string | null;
  projectKey: string | null;
}

export interface TimingSample {
  platform: PublishingPlatform;
  hour: number;
  impressions: number;
  engagements: number;
}

export interface CandidateDecision {
  candidate: PublishingCandidate;
  score: number;
  eligible: boolean;
  reasons: string[];
}

export interface PlatformPublishingLane {
  platform: PublishingPlatform;
  activeToday: boolean;
  quota: number;
  alreadyPublished: number;
  remaining: number;
  recommendedHour: number;
  timingReason: string;
  selected: CandidateDecision[];
  skippedReason: string | null;
}

export interface AdaptivePublishingPlan {
  lanes: PlatformPublishingLane[];
  decisions: CandidateDecision[];
  intentionallySkipped: CandidateDecision[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function effectivePostsPerDay(
  settings: Pick<
    AdaptiveCadenceSettings,
    "adaptiveCadenceEnabled" | "postsPerDay" | "xPostsPerDay"
  >,
): number {
  return clamp(
    settings.adaptiveCadenceEnabled ? settings.xPostsPerDay : settings.postsPerDay,
    1,
    12,
  );
}

export function linkedInPublishingDays(postsPerWeek: number): number[] {
  const count = clamp(postsPerWeek, 1, 7);
  if (count === 1) return [3];
  if (count === 2) return [2, 4];
  if (count === 3) return [1, 3, 5];
  if (count === 4) return [1, 2, 4, 6];
  if (count === 5) return [1, 2, 3, 4, 5];
  if (count === 6) return [1, 2, 3, 4, 5, 6];
  return [0, 1, 2, 3, 4, 5, 6];
}

export function candidateScore(candidate: PublishingCandidate): number {
  const overall = candidate.scoreOverall ?? 0;
  const novelty = candidate.scoreNovelty ?? 0;
  const engagement = candidate.scoreEngagement ?? 0;
  const hook = candidate.scoreHook ?? 0;
  return (
    Math.round((overall * 0.4 + novelty * 0.25 + engagement * 0.2 + hook * 0.15) * 10) /
    10
  );
}

export function projectKeyFromSource(externalId: string, title = ""): string | null {
  if (externalId.startsWith("owned:")) return externalId.split(":")[1] || null;
  if (externalId.startsWith("owned-intel:")) {
    const project = title.split(":")[0]?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return project || "owned-project";
  }
  return null;
}

export function generationQualityGate(
  scores: { overall: number; novelty: number },
  settings: Pick<
    AdaptiveCadenceSettings,
    "adaptiveCadenceEnabled" | "qualityThreshold" | "minimumNovelty"
  >,
): string[] {
  if (!settings.adaptiveCadenceEnabled) return [];
  const reasons: string[] = [];
  if (scores.overall < settings.qualityThreshold) {
    reasons.push(`quality ${scores.overall.toFixed(1)} < ${settings.qualityThreshold.toFixed(1)}`);
  }
  if (scores.novelty < settings.minimumNovelty) {
    reasons.push(`novelty ${scores.novelty.toFixed(1)} < ${settings.minimumNovelty.toFixed(1)}`);
  }
  return reasons;
}

export function generationCooldownReason(input: {
  sourceProjectKey: string | null;
  contentType: string;
  recentPosts: Array<{
    createdAt: Date;
    contentType: string | null;
    projectKeys: string[];
  }>;
  now: Date;
  settings: Pick<
    AdaptiveCadenceSettings,
    "adaptiveCadenceEnabled" | "projectCooldownHours" | "contentTypeCooldownHours"
  >;
}): string | null {
  if (!input.settings.adaptiveCadenceEnabled) return null;
  for (const post of input.recentPosts) {
    const hoursAgo = (input.now.getTime() - post.createdAt.getTime()) / 3_600_000;
    if (
      input.sourceProjectKey &&
      post.projectKeys.includes(input.sourceProjectKey) &&
      hoursAgo < input.settings.projectCooldownHours
    ) {
      return `project ${input.sourceProjectKey} is inside the ${input.settings.projectCooldownHours}h cooldown`;
    }
    if (
      post.contentType === input.contentType &&
      hoursAgo < input.settings.contentTypeCooldownHours
    ) {
      return `${input.contentType.replaceAll("_", " ")} is inside the ${input.settings.contentTypeCooldownHours}h cooldown`;
    }
  }
  return null;
}

function cooldownReason(
  candidate: PublishingCandidate,
  publications: RecentPublication[],
  now: Date,
  settings: AdaptiveCadenceSettings,
): string | null {
  for (const publication of publications) {
    if (publication.postId === candidate.id) continue;
    const hoursAgo = (now.getTime() - publication.publishedAt.getTime()) / 3_600_000;
    if (
      candidate.projectKey &&
      publication.projectKey === candidate.projectKey &&
      hoursAgo < settings.projectCooldownHours
    ) {
      return `Project cooldown: ${candidate.projectKey} appeared ${Math.max(1, Math.round(hoursAgo))}h ago`;
    }
    if (
      candidate.contentType &&
      publication.contentType === candidate.contentType &&
      hoursAgo < settings.contentTypeCooldownHours
    ) {
      return `Format cooldown: ${candidate.contentType.replaceAll("_", " ")} appeared ${Math.max(1, Math.round(hoursAgo))}h ago`;
    }
  }
  return null;
}

export function evaluateCandidate(
  candidate: PublishingCandidate,
  publications: RecentPublication[],
  settings: AdaptiveCadenceSettings,
  now: Date,
): CandidateDecision {
  const reasons: string[] = [];
  if (!candidate.hasEvidence) reasons.push("No persisted source evidence");
  if ((candidate.scoreOverall ?? 0) < settings.qualityThreshold) {
    reasons.push(
      `Quality ${(candidate.scoreOverall ?? 0).toFixed(1)} is below ${settings.qualityThreshold.toFixed(1)}`,
    );
  }
  if ((candidate.scoreNovelty ?? 0) < settings.minimumNovelty) {
    reasons.push(
      `Novelty ${(candidate.scoreNovelty ?? 0).toFixed(1)} is below ${settings.minimumNovelty.toFixed(1)}`,
    );
  }
  const cooldown = cooldownReason(candidate, publications, now, settings);
  if (cooldown) reasons.push(cooldown);
  return {
    candidate,
    score: candidateScore(candidate),
    eligible: reasons.length === 0,
    reasons,
  };
}

function recommendationHour(
  platform: PublishingPlatform,
  samples: TimingSample[],
): { hour: number; reason: string } {
  const relevant = samples.filter(
    (sample) => sample.platform === platform && sample.impressions > 0,
  );
  if (relevant.length < 3) {
    return platform === "x"
      ? { hour: 9, reason: "9:00 fallback until at least 3 measured X posts exist" }
      : { hour: 10, reason: "10:00 fallback until at least 3 measured LinkedIn posts exist" };
  }
  const byHour = new Map<
    number,
    { impressions: number; engagements: number; count: number }
  >();
  for (const sample of relevant) {
    const hour = clamp(sample.hour, 0, 23);
    const aggregate = byHour.get(hour) ?? { impressions: 0, engagements: 0, count: 0 };
    aggregate.impressions += sample.impressions;
    aggregate.engagements += sample.engagements;
    aggregate.count += 1;
    byHour.set(hour, aggregate);
  }
  const ranked = [...byHour.entries()]
    .filter(([, value]) => value.count >= 2 || byHour.size === 1)
    .sort(([, a], [, b]) => {
      const rateA = a.impressions > 0 ? a.engagements / a.impressions : 0;
      const rateB = b.impressions > 0 ? b.engagements / b.impressions : 0;
      return rateB - rateA || b.impressions - a.impressions;
    });
  const winner =
    ranked[0] ?? [...byHour.entries()].sort(([, a], [, b]) => b.impressions - a.impressions)[0];
  return {
    hour: winner?.[0] ?? (platform === "x" ? 9 : 10),
    reason: `Best measured ${platform === "x" ? "X" : "LinkedIn"} engagement window from ${relevant.length} posts`,
  };
}

function dayKey(date: Date, timezone: string): string {
  return formatInTimeZone(date, timezone, "yyyy-MM-dd");
}

function weekStart(date: Date, timezone: string): Date {
  const zoned = toZonedTime(date, timezone);
  const day = zoned.getDay();
  zoned.setDate(zoned.getDate() - ((day + 6) % 7));
  zoned.setHours(0, 0, 0, 0);
  return fromZonedTime(zoned, timezone);
}

export function buildAdaptivePublishingPlan(input: {
  now: Date;
  timezone?: string;
  settings: AdaptiveCadenceSettings;
  candidates: PublishingCandidate[];
  publications: RecentPublication[];
  timingSamples: TimingSample[];
}): AdaptivePublishingPlan {
  const decisions = input.candidates
    .map((candidate) =>
      evaluateCandidate(candidate, input.publications, input.settings, input.now),
    )
    .sort(
      (a, b) =>
        b.score - a.score || b.candidate.createdAt.getTime() - a.candidate.createdAt.getTime(),
    );
  const eligible = decisions.filter((decision) => decision.eligible);
  const timezone = input.timezone ?? "UTC";
  const today = dayKey(input.now, timezone);
  const startOfWeek = weekStart(input.now, timezone);
  const localDay = Number(formatInTimeZone(input.now, timezone, "i")) % 7;

  const lanes = (["x", "linkedin"] as const).map(
    (platform): PlatformPublishingLane => {
      const timing = recommendationHour(platform, input.timingSamples);
      const published = input.publications.filter(
        (publication) => publication.platform === platform,
      );
      const alreadyPublished =
        platform === "x"
          ? published.filter((publication) => dayKey(publication.publishedAt, timezone) === today).length
          : published.filter((publication) => publication.publishedAt >= startOfWeek).length;
      const quota =
        platform === "x"
          ? clamp(input.settings.xPostsPerDay, 1, 12)
          : clamp(input.settings.linkedInPostsPerWeek, 1, 7);
      const activeToday =
        platform === "x" ||
        linkedInPublishingDays(quota).includes(localDay);
      const remaining = Math.max(0, quota - alreadyPublished);
      const platformCandidates = eligible.filter((decision) =>
        platform === "x" ? decision.candidate.hasX : decision.candidate.hasLinkedIn,
      );
      const dailySelectionLimit = platform === "x" ? remaining : Math.min(1, remaining);
      const selected = activeToday
        ? platformCandidates.slice(0, dailySelectionLimit)
        : [];
      let skippedReason: string | null = null;
      if (!activeToday) skippedReason = "Intentional LinkedIn rest day";
      else if (remaining === 0) {
        skippedReason = platform === "x" ? "Daily X quota reached" : "Weekly LinkedIn quota reached";
      } else if (selected.length === 0) {
        skippedReason = "No draft passed evidence, novelty, quality, and cooldown gates";
      }
      return {
        platform,
        activeToday,
        quota,
        alreadyPublished,
        remaining,
        recommendedHour: timing.hour,
        timingReason: timing.reason,
        selected,
        skippedReason,
      };
    },
  );

  return {
    lanes,
    decisions,
    intentionallySkipped: decisions.filter((decision) => !decision.eligible),
  };
}
