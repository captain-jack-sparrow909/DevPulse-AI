import { prisma } from "@/lib/db";
import {
  aggregateValidationMetrics,
  buildCheckpointSchedule,
  recommendValidationActions,
  type ValidationFollowerPoint,
  type ValidationMetrics,
} from "@/lib/validation/study";

const DAY = 24 * 60 * 60 * 1000;

function parseMetrics(value: string): ValidationMetrics {
  return JSON.parse(value) as ValidationMetrics;
}

async function collectMetrics(userId: string, periodStart: Date, periodEnd: Date) {
  const [workflows, rawSnapshots, rawFollowers] = await Promise.all([
    prisma.distributionWorkflow.findMany({
      where: { userId, publishedAt: { gte: periodStart, lte: periodEnd }, platform: { in: ["x", "linkedin"] } },
      select: { postId: true, platform: true },
    }),
    prisma.socialPerformanceSnapshot.findMany({
      where: { userId, capturedAt: { gte: periodStart, lte: periodEnd }, platform: { in: ["x", "linkedin"] } },
      orderBy: { capturedAt: "desc" },
      select: { postId: true, platform: true, impressions: true, likes: true, replies: true, reposts: true, saves: true, profileVisits: true, linkClicks: true },
    }),
    prisma.followerCheckpoint.findMany({
      where: { userId, capturedAt: { lte: periodEnd }, platform: { in: ["x", "linkedin"] } },
      orderBy: { capturedAt: "desc" },
      take: 200,
      select: { platform: true, followers: true, capturedAt: true },
    }),
  ]);

  const latestSnapshots = new Map<string, (typeof rawSnapshots)[number]>();
  for (const snapshot of rawSnapshots) {
    const key = `${snapshot.postId}:${snapshot.platform}`;
    if (!latestSnapshots.has(key)) latestSnapshots.set(key, snapshot);
  }

  const followerPoints: ValidationFollowerPoint[] = [];
  for (const platform of ["x", "linkedin"]) {
    const points = rawFollowers
      .filter((point) => point.platform === platform)
      .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
    // Prefer a checkpoint at/before the boundary. If the first observation was
    // entered shortly after the study began, retain it as the starting point
    // instead of permanently losing follower-growth comparability.
    const boundary = points.filter((point) => point.capturedAt <= periodStart).at(-1) ?? points[0];
    const latest = points.at(-1);
    if (boundary) followerPoints.push(boundary);
    if (latest && latest !== boundary) followerPoints.push(latest);
  }

  return aggregateValidationMetrics({
    publications: workflows,
    snapshots: [...latestSnapshots.values()],
    followerPoints,
  });
}

export async function createGrowthValidationStudy(userId: string, now = new Date()) {
  const existing = await prisma.growthValidationStudy.findFirst({
    where: { userId, status: "active" },
    include: { checkpoints: { orderBy: { sequence: "asc" } } },
  });
  if (existing) return existing;

  const settings = await prisma.userSettings.upsert({ where: { userId }, create: { userId }, update: {} });
  const baselineStart = new Date(now.getTime() - 30 * DAY);
  const baseline = await collectMetrics(userId, baselineStart, now);
  const schedule = buildCheckpointSchedule(now);
  const settingsSnapshot = {
    adaptiveCadenceEnabled: settings.adaptiveCadenceEnabled,
    xPostsPerDay: settings.xPostsPerDay,
    linkedInPostsPerWeek: settings.linkedInPostsPerWeek,
    qualityThreshold: settings.qualityThreshold,
    minimumNovelty: settings.minimumNovelty,
    projectCooldownHours: settings.projectCooldownHours,
    contentTypeCooldownHours: settings.contentTypeCooldownHours,
    firstPostHour: settings.firstPostHour,
    lastPostHour: settings.lastPostHour,
  };
  const targets = {
    durationDays: 30,
    minimumMeasurementCoverage: 80,
    minimumComparablePostsPerPlatform: 5,
    engagementRateImprovementPercent: 10,
    followerGrowth: "positive",
    cadenceAdherencePercent: 70,
  };

  return prisma.growthValidationStudy.create({
    data: {
      userId,
      timezone: settings.timezone,
      periodStart: now,
      periodEnd: schedule.at(-1)!.scheduledFor,
      baselineJson: JSON.stringify(baseline),
      targetsJson: JSON.stringify(targets),
      settingsSnapshotJson: JSON.stringify(settingsSnapshot),
      currentSummaryJson: JSON.stringify(baseline),
      checkpoints: {
        create: schedule.map((checkpoint) => ({
          sequence: checkpoint.sequence,
          label: checkpoint.label,
          scheduledFor: checkpoint.scheduledFor,
          status: checkpoint.sequence === 0 ? "captured" : "pending",
          metricsJson: checkpoint.sequence === 0 ? JSON.stringify(baseline) : "{}",
          recommendationsJson: checkpoint.sequence === 0
            ? JSON.stringify([{ category: "measurement", severity: "info", title: "Baseline captured", rationale: "The previous 30 days are the comparison window.", action: "Record follower checkpoints now and continue the approved cadence." }])
            : "[]",
          capturedAt: checkpoint.sequence === 0 ? now : null,
        })),
      },
    },
    include: { checkpoints: { orderBy: { sequence: "asc" } } },
  });
}

export async function captureGrowthValidationCheckpoint(userId: string, studyId: string, now = new Date()) {
  const study = await prisma.growthValidationStudy.findFirst({
    where: { id: studyId, userId, status: "active" },
    include: { checkpoints: { orderBy: { sequence: "asc" } } },
  });
  if (!study) throw new Error("Active validation study not found.");
  const checkpoint = study.checkpoints.find((item) => item.status === "pending" && item.scheduledFor <= now);
  if (!checkpoint) throw new Error("The next checkpoint is not due yet.");

  const current = await collectMetrics(userId, study.periodStart, now);
  const baseline = parseMetrics(study.baselineJson);
  const settings = JSON.parse(study.settingsSnapshotJson) as { xPostsPerDay: number; linkedInPostsPerWeek: number };
  const elapsedDays = Math.max(1, Math.floor((now.getTime() - study.periodStart.getTime()) / DAY));
  const recommendations = recommendValidationActions({ baseline, current, elapsedDays, ...settings });
  const completed = checkpoint.sequence === 4 || now >= study.periodEnd;
  const conclusion = completed ? {
    completedAt: now.toISOString(),
    result: recommendations.some((item) => item.severity === "positive") ? "positive_signal" : "insufficient_or_mixed_signal",
    note: "Only evidence-backed recommendations should be applied one at a time in the next cycle.",
  } : {};

  await prisma.$transaction([
    prisma.growthValidationCheckpoint.update({
      where: { id: checkpoint.id },
      data: { status: "captured", metricsJson: JSON.stringify(current), recommendationsJson: JSON.stringify(recommendations), capturedAt: now },
    }),
    prisma.growthValidationStudy.update({
      where: { id: study.id },
      data: {
        status: completed ? "completed" : "active",
        currentSummaryJson: JSON.stringify(current),
        recommendationsJson: JSON.stringify(recommendations),
        conclusionJson: JSON.stringify(conclusion),
        completedAt: completed ? now : null,
      },
    }),
  ]);

  return prisma.growthValidationStudy.findUniqueOrThrow({
    where: { id: study.id },
    include: { checkpoints: { orderBy: { sequence: "asc" } } },
  });
}
