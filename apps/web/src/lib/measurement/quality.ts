export type MeasurementCheckpoint = "1h" | "24h" | "72h" | "7d";

export interface MeasurementSnapshotInput {
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
  checkpoint?: string | null;
  capturedAt: Date;
}

export interface MeasurementPostInput {
  id: string;
  label: string;
  postedAt: Date;
  snapshots: MeasurementSnapshotInput[];
}

export interface MeasurementTask {
  id: string;
  postId: string;
  postLabel: string;
  platform: "x" | "linkedin";
  checkpoint: MeasurementCheckpoint;
  dueAt: Date;
  status: "upcoming" | "due" | "overdue" | "missed" | "completed";
  completedAt: Date | null;
}

export interface MeasurementAlert {
  key: string;
  severity: "warning" | "error";
  message: string;
  postId: string;
  platform: string;
}

export const MEASUREMENT_CHECKPOINTS: Array<{
  key: MeasurementCheckpoint;
  hours: number;
  minHours: number;
  maxHours: number;
}> = [
  { key: "1h", hours: 1, minHours: 0.5, maxHours: 4 },
  { key: "24h", hours: 24, minHours: 18, maxHours: 36 },
  { key: "72h", hours: 72, minHours: 60, maxHours: 96 },
  { key: "7d", hours: 168, minHours: 144, maxHours: 216 },
];

const HOUR = 60 * 60 * 1_000;

export function inferMeasurementCheckpoint(postedAt: Date, capturedAt: Date): MeasurementCheckpoint | "custom" {
  const ageHours = (capturedAt.getTime() - postedAt.getTime()) / HOUR;
  const match = MEASUREMENT_CHECKPOINTS.find((item) => ageHours >= item.minHours && ageHours <= item.maxHours);
  return match?.key ?? "custom";
}

function effectiveCheckpoint(snapshot: MeasurementSnapshotInput, postedAt: Date) {
  const inferred = inferMeasurementCheckpoint(postedAt, snapshot.capturedAt);
  if (MEASUREMENT_CHECKPOINTS.some((item) => item.key === snapshot.checkpoint)) {
    return inferred === snapshot.checkpoint ? inferred : "custom";
  }
  return inferred;
}

export function selectComparableCheckpointRecords<T extends MeasurementSnapshotInput>(
  records: T[],
  postedAtByPost: Map<string, Date>,
  checkpoint: MeasurementCheckpoint = "24h",
): T[] {
  const latest = new Map<string, T>();
  for (const record of records) {
    const postedAt = postedAtByPost.get(record.postId);
    if (!postedAt || effectiveCheckpoint(record, postedAt) !== checkpoint) continue;
    const key = `${record.postId}:${record.platform}`;
    const current = latest.get(key);
    if (!current || record.capturedAt > current.capturedAt) latest.set(key, record);
  }
  return [...latest.values()];
}

export function buildMeasurementQueue(posts: MeasurementPostInput[], now = new Date()): MeasurementTask[] {
  const tasks: MeasurementTask[] = [];
  for (const post of posts) {
    for (const platform of ["x", "linkedin"] as const) {
      const snapshots = post.snapshots.filter((item) => item.platform === platform);
      for (const checkpoint of MEASUREMENT_CHECKPOINTS) {
        const dueAt = new Date(post.postedAt.getTime() + checkpoint.hours * HOUR);
        const completed = snapshots
          .filter((snapshot) => effectiveCheckpoint(snapshot, post.postedAt) === checkpoint.key)
          .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime())[0];
        const overdueAt = new Date(dueAt.getTime() + Math.max(6, checkpoint.hours * 0.25) * HOUR);
        const windowEnd = new Date(post.postedAt.getTime() + checkpoint.maxHours * HOUR);
        const status: MeasurementTask["status"] = completed
          ? "completed"
          : now < dueAt
            ? "upcoming"
            : now > windowEnd
              ? "missed"
              : now <= overdueAt
              ? "due"
              : "overdue";
        tasks.push({
          id: `${post.id}:${platform}:${checkpoint.key}`,
          postId: post.id,
          postLabel: post.label,
          platform,
          checkpoint: checkpoint.key,
          dueAt,
          status,
          completedAt: completed?.capturedAt ?? null,
        });
      }
    }
  }
  const rank = { overdue: 0, due: 1, upcoming: 2, missed: 3, completed: 4 };
  return tasks.sort((a, b) => rank[a.status] - rank[b.status] || a.dueAt.getTime() - b.dueAt.getTime());
}

export function measurementCoverage(tasks: MeasurementTask[]) {
  const dueTasks = tasks.filter((task) => task.status !== "upcoming");
  const completedTasks = dueTasks.filter((task) => task.status === "completed");
  const due24h = dueTasks.filter((task) => task.checkpoint === "24h");
  const completed24h = due24h.filter((task) => task.status === "completed");
  const coverage = dueTasks.length ? Math.round((completedTasks.length / dueTasks.length) * 1_000) / 10 : 0;
  const comparableCoverage = due24h.length ? Math.round((completed24h.length / due24h.length) * 1_000) / 10 : 0;
  const comparablePostIds = new Set(completed24h.map((task) => task.postId));
  const byPlatform = (["x", "linkedin"] as const).map((platform) => {
    const platformDue = due24h.filter((task) => task.platform === platform);
    const platformCompleted = platformDue.filter((task) => task.status === "completed");
    return {
      platform,
      due24h: platformDue.length,
      completed24h: platformCompleted.length,
      coverage: platformDue.length ? Math.round((platformCompleted.length / platformDue.length) * 1_000) / 10 : 0,
    };
  });
  const confidence: "low" | "medium" | "high" = comparablePostIds.size >= 10 && comparableCoverage >= 80
    ? "high"
    : comparablePostIds.size >= 6 && comparableCoverage >= 60
      ? "medium"
      : "low";
  return {
    dueTasks: dueTasks.length,
    completedTasks: completedTasks.length,
    overdueTasks: dueTasks.filter((task) => task.status === "overdue").length,
    missedTasks: dueTasks.filter((task) => task.status === "missed").length,
    coverage,
    due24h: due24h.length,
    completed24h: completed24h.length,
    comparableCoverage,
    comparablePosts: comparablePostIds.size,
    confidence,
    byPlatform,
  };
}

export function measurementAlerts(posts: MeasurementPostInput[]): MeasurementAlert[] {
  const alerts: MeasurementAlert[] = [];
  const cumulativeFields = ["impressions", "likes", "replies", "reposts", "saves", "profileVisits", "linkClicks"] as const;
  for (const post of posts) {
    for (const platform of ["x", "linkedin"] as const) {
      const rows = post.snapshots.filter((item) => item.platform === platform).sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
      const seen = new Set<string>();
      for (const row of rows) {
        const checkpoint = effectiveCheckpoint(row, post.postedAt);
        const inferred = inferMeasurementCheckpoint(post.postedAt, row.capturedAt);
        if (row.capturedAt < post.postedAt) {
          alerts.push({ key: `${row.id}:before-post`, severity: "error", message: "Snapshot was captured before the recorded publish time.", postId: post.id, platform });
        }
        if (checkpoint !== "custom" && seen.has(checkpoint)) {
          alerts.push({ key: `${row.id}:duplicate`, severity: "warning", message: `Multiple ${checkpoint} snapshots exist; only the newest is used.`, postId: post.id, platform });
        }
        seen.add(checkpoint);
        if ((row.followersBefore == null) !== (row.followersAfter == null)) {
          alerts.push({ key: `${row.id}:followers`, severity: "warning", message: "Follower before/after values are incomplete.", postId: post.id, platform });
        }
        if (MEASUREMENT_CHECKPOINTS.some((item) => item.key === row.checkpoint) && inferred !== row.checkpoint) {
          alerts.push({ key: `${row.id}:checkpoint-age`, severity: "warning", message: `Marked ${row.checkpoint}, but its capture time falls outside that checkpoint window. It is excluded from comparable cohorts.`, postId: post.id, platform });
        }
      }
      for (let index = 1; index < rows.length; index += 1) {
        const previous = rows[index - 1]!;
        const current = rows[index]!;
        const regressed = cumulativeFields.filter((field) => current[field] < previous[field]);
        if (regressed.length) {
          alerts.push({ key: `${current.id}:regression`, severity: "error", message: `Cumulative metrics decreased: ${regressed.join(", ")}.`, postId: post.id, platform });
        }
      }
    }
  }
  return alerts;
}
