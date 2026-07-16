export interface PerformanceRecord {
  id: string;
  postId: string;
  platform: "x" | "linkedin";
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
  post: {
    title: string | null;
    hook: string | null;
    contentType: string | null;
    angle: string | null;
    format: string;
    mediaTypeX?: string | null;
    mediaTypeLinkedIn?: string | null;
    postedManuallyAt: Date | null;
    schedule: { scheduledFor: Date } | null;
    sources: Array<{
      source: { provider: string; externalId: string; title: string };
    }>;
  };
}

export interface PerformanceSummary {
  trackedPosts: number;
  platformSnapshots: number;
  impressions: number;
  engagements: number;
  engagementRate: number;
  replies: number;
  reposts: number;
  saves: number;
  profileVisits: number;
  linkClicks: number;
  followersGained: number;
}

export interface PerformanceBreakdown {
  key: string;
  label: string;
  posts: number;
  impressions: number;
  engagements: number;
  engagementRate: number;
  followersGained: number;
}

export interface PerformanceReport {
  summary: PerformanceSummary;
  byPlatform: PerformanceBreakdown[];
  byContentType: PerformanceBreakdown[];
  byProject: PerformanceBreakdown[];
  byPostingHour: PerformanceBreakdown[];
  byMediaType: PerformanceBreakdown[];
  recommendations: string[];
  latestRecords: PerformanceRecord[];
}

function nonNegative(value: number): number {
  return Math.max(0, Number.isFinite(value) ? Math.round(value) : 0);
}

export function engagementCount(record: PerformanceRecord): number {
  return (
    nonNegative(record.likes) +
    nonNegative(record.replies) +
    nonNegative(record.reposts) +
    nonNegative(record.saves) +
    nonNegative(record.linkClicks)
  );
}

export function followerDelta(record: PerformanceRecord): number {
  if (record.followersBefore == null || record.followersAfter == null) return 0;
  return record.followersAfter - record.followersBefore;
}

export function followUpSuggestion(record: PerformanceRecord): string {
  const engagements = engagementCount(record);
  const rate = engagementRate(record.impressions, engagements);
  if (record.replies > 0) {
    return "Reply to each substantive comment with one concrete detail or a focused follow-up question while the conversation is active.";
  }
  if (record.saves >= Math.max(3, record.likes / 2)) {
    return "This earned relatively strong saves; turn the same verified fact card into a deeper architecture or implementation breakdown.";
  }
  if (record.impressions >= 500 && rate < 1) {
    return "Reach exceeded interaction. Reuse the topic only with a sharper first post and a more specific engineering tension.";
  }
  if (record.profileVisits > 0 && followerDelta(record) <= 0) {
    return "The post produced profile visits without follower growth; make the profile headline and pinned post promise the same product-engineering value.";
  }
  return "Capture another snapshot at the same post age before deciding whether to reuse or retire this angle.";
}

export function engagementRate(
  impressions: number,
  engagements: number,
): number {
  if (impressions <= 0) return 0;
  return Math.round((engagements / impressions) * 10_000) / 100;
}

/** Cumulative metrics should contribute only the latest snapshot per post/platform. */
export function latestPerformanceRecords(
  records: PerformanceRecord[],
): PerformanceRecord[] {
  const latest = new Map<string, PerformanceRecord>();
  for (const record of records) {
    const key = `${record.postId}:${record.platform}`;
    const current = latest.get(key);
    if (!current || record.capturedAt > current.capturedAt) latest.set(key, record);
  }
  return [...latest.values()].sort(
    (a, b) => b.capturedAt.getTime() - a.capturedAt.getTime(),
  );
}

function summarize(records: PerformanceRecord[]): PerformanceSummary {
  const postIds = new Set(records.map((record) => record.postId));
  const impressions = records.reduce(
    (sum, record) => sum + nonNegative(record.impressions),
    0,
  );
  const engagements = records.reduce(
    (sum, record) => sum + engagementCount(record),
    0,
  );
  return {
    trackedPosts: postIds.size,
    platformSnapshots: records.length,
    impressions,
    engagements,
    engagementRate: engagementRate(impressions, engagements),
    replies: records.reduce((sum, record) => sum + nonNegative(record.replies), 0),
    reposts: records.reduce((sum, record) => sum + nonNegative(record.reposts), 0),
    saves: records.reduce((sum, record) => sum + nonNegative(record.saves), 0),
    profileVisits: records.reduce(
      (sum, record) => sum + nonNegative(record.profileVisits),
      0,
    ),
    linkClicks: records.reduce(
      (sum, record) => sum + nonNegative(record.linkClicks),
      0,
    ),
    followersGained: records.reduce(
      (sum, record) => sum + followerDelta(record),
      0,
    ),
  };
}

function projectKey(record: PerformanceRecord): string {
  const project = record.post.sources.find(
    ({ source }) =>
      source.provider === "project" && source.externalId.startsWith("owned:"),
  )?.source;
  if (!project) return "external";
  return project.externalId.split(":")[1] || "owned-project";
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function postingHour(record: PerformanceRecord, timezone: string): string {
  const date = record.post.postedManuallyAt ?? record.post.schedule?.scheduledFor;
  if (!date) return "unknown";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

function breakdown(
  records: PerformanceRecord[],
  keyFor: (record: PerformanceRecord) => string,
): PerformanceBreakdown[] {
  const groups = new Map<string, PerformanceRecord[]>();
  for (const record of records) {
    const key = keyFor(record) || "unknown";
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups.entries()]
    .map(([key, group]) => {
      const summary = summarize(group);
      return {
        key,
        label: key === "unknown" ? "Unknown" : titleCase(key),
        posts: new Set(group.map((record) => record.postId)).size,
        impressions: summary.impressions,
        engagements: summary.engagements,
        engagementRate: summary.engagementRate,
        followersGained: summary.followersGained,
      };
    })
    .sort((a, b) => {
      if (b.engagementRate !== a.engagementRate) {
        return b.engagementRate - a.engagementRate;
      }
      return b.impressions - a.impressions;
    });
}

function recommendations(
  summary: PerformanceSummary,
  byContentType: PerformanceBreakdown[],
  byProject: PerformanceBreakdown[],
  byPostingHour: PerformanceBreakdown[],
): string[] {
  if (summary.trackedPosts < 3) {
    return [
      `Record both X and LinkedIn metrics for at least ${3 - summary.trackedPosts} more posted post(s) before changing the strategy.`,
      "Capture cumulative metrics at a consistent age—ideally 24 hours after publishing—so comparisons are meaningful.",
    ];
  }

  const output: string[] = [];
  const topType = byContentType.find((group) => group.posts >= 2);
  if (topType) {
    output.push(
      `${topType.label} currently leads at ${topType.engagementRate.toFixed(2)}% engagement across ${topType.posts} tracked posts; test one more before increasing its content weight.`,
    );
  }
  const topProject = byProject.find(
    (group) => group.key !== "external" && group.posts >= 2,
  );
  if (topProject) {
    output.push(
      `${topProject.label} is the strongest repeated product topic so far; create a new fact card instead of repeating its existing hook.`,
    );
  }
  const topHour = byPostingHour.find(
    (group) => group.key !== "unknown" && group.posts >= 2,
  );
  if (topHour) {
    output.push(
      `${topHour.key}:00 is the strongest observed posting hour, but keep it as a hypothesis until at least five posts share that window.`,
    );
  }
  if (summary.impressions > 0 && summary.engagementRate < 1) {
    output.push(
      "Reach is arriving but interaction is weak: tighten the first post and end with one specific engineering decision readers can answer.",
    );
  }
  if (summary.profileVisits > 0 && summary.followersGained <= 0) {
    output.push(
      "Posts are producing profile visits without follower growth; align the profile promise and pinned post with the same product-engineering niche.",
    );
  }
  return output.slice(0, 5);
}

export function buildPerformanceReport(
  records: PerformanceRecord[],
  timezone = "Asia/Dubai",
): PerformanceReport {
  const latestRecords = latestPerformanceRecords(records);
  const summary = summarize(latestRecords);
  const byPlatform = breakdown(latestRecords, (record) => record.platform);
  const byContentType = breakdown(
    latestRecords,
    (record) => record.post.contentType || record.post.angle || "unknown",
  );
  const byProject = breakdown(latestRecords, projectKey);
  const byPostingHour = breakdown(latestRecords, (record) =>
    postingHour(record, timezone),
  );
  const byMediaType = breakdown(
    latestRecords,
    (record) =>
      (record.platform === "linkedin"
        ? record.post.mediaTypeLinkedIn
        : record.post.mediaTypeX) || "text_only",
  );
  return {
    summary,
    byPlatform,
    byContentType,
    byProject,
    byPostingHour,
    byMediaType,
    recommendations: recommendations(
      summary,
      byContentType,
      byProject,
      byPostingHour,
    ),
    latestRecords,
  };
}
