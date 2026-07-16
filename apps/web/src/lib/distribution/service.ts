import { prisma } from "@/lib/db";

export async function ensureDistributionWorkflows(userId: string) {
  const posts = await prisma.post.findMany({
    where: {
      userId,
      status: { in: ["approved", "scheduled", "ready", "posted_manually"] },
    },
    select: { id: true, status: true, postedManuallyAt: true },
    orderBy: { updatedAt: "desc" },
    take: 15,
  });
  await Promise.all(
    posts.flatMap((post) =>
      (["x", "linkedin"] as const).map((platform) =>
        prisma.distributionWorkflow.upsert({
          where: { postId_platform: { postId: post.id, platform } },
          create: {
            userId,
            postId: post.id,
            platform,
            status: post.status === "posted_manually" ? "published" : "planned",
            publishedAt: post.status === "posted_manually" ? post.postedManuallyAt ?? new Date() : null,
          },
          update:
            post.status === "posted_manually"
              ? {
                  publishedAt: post.postedManuallyAt ?? undefined,
                }
              : {},
        }),
      ),
    ),
  );
  await prisma.distributionWorkflow.updateMany({
    where: {
      userId,
      status: { in: ["planned", "prepared"] },
      post: { status: "posted_manually" },
    },
    data: { status: "published" },
  });
}

export async function ensureCreatorRelationships(userId: string) {
  const opportunities = await prisma.engagementOpportunity.findMany({
    where: { userId, status: "replied", author: { not: null }, relationshipId: null },
    orderBy: { repliedAt: "asc" },
    take: 100,
  });
  for (const opportunity of opportunities) {
    const handle = opportunity.author?.trim().toLowerCase().replace(/^@/, "").slice(0, 120);
    if (!handle) continue;
    const relationship = await prisma.creatorRelationship.upsert({
      where: { userId_platform_handle: { userId, platform: opportunity.platform, handle } },
      create: {
        userId,
        platform: opportunity.platform,
        handle,
        displayName: opportunity.author,
        interactionCount: 1,
        replyCount: 1,
        lastInteractionAt: opportunity.repliedAt ?? opportunity.updatedAt,
        topicsJson: JSON.stringify(opportunity.topic ? [opportunity.topic] : []),
      },
      update: {
        interactionCount: { increment: 1 },
        replyCount: { increment: 1 },
        lastInteractionAt: opportunity.repliedAt ?? opportunity.updatedAt,
      },
    });
    await prisma.engagementOpportunity.update({
      where: { id: opportunity.id },
      data: { relationshipId: relationship.id },
    });
  }
}

export type WorkflowAction =
  | "asset_ready"
  | "pre_engaged"
  | "published"
  | "comments_reviewed"
  | "metrics_captured"
  | "complete";

export function workflowUpdate(action: WorkflowAction, now = new Date()) {
  if (action === "asset_ready") return { assetReadyAt: now, status: "prepared" };
  if (action === "pre_engaged") return { preEngagedAt: now, status: "prepared" };
  if (action === "published") return { publishedAt: now, status: "published" };
  if (action === "comments_reviewed") return { commentsReviewedAt: now, status: "follow_up" };
  if (action === "metrics_captured") return { metricsCapturedAt: now, status: "follow_up" };
  return { completedAt: now, status: "completed" };
}

export function nextWorkflowAction(workflow: {
  assetReadyAt: Date | null;
  preEngagedAt: Date | null;
  publishedAt: Date | null;
  commentsReviewedAt: Date | null;
  metricsCapturedAt: Date | null;
  completedAt: Date | null;
}) {
  if (!workflow.assetReadyAt) return "Confirm copy and asset";
  if (!workflow.preEngagedAt) return "Join relevant conversations before posting";
  if (!workflow.publishedAt) return "Publish manually";
  if (!workflow.commentsReviewedAt) return "Review and answer substantive comments";
  if (!workflow.metricsCapturedAt) return "Capture performance at a consistent age";
  if (!workflow.completedAt) return "Complete distribution cycle";
  return "Completed";
}

interface DistributionMetricRecord {
  postId: string;
  platform: string;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  saves: number;
  linkClicks: number;
  followersBefore: number | null;
  followersAfter: number | null;
  capturedAt: Date;
}

function metricSummary(records: DistributionMetricRecord[]) {
  const impressions = records.reduce((sum, record) => sum + record.impressions, 0);
  const engagements = records.reduce(
    (sum, record) => sum + record.likes + record.replies + record.reposts + record.saves + record.linkClicks,
    0,
  );
  return {
    records: records.length,
    impressions,
    engagementRate: impressions > 0 ? Math.round((engagements / impressions) * 10_000) / 100 : 0,
    followersGained: records.reduce(
      (sum, record) =>
        sum +
        (record.followersBefore == null || record.followersAfter == null
          ? 0
          : record.followersAfter - record.followersBefore),
      0,
    ),
  };
}

export function buildDistributionComparison(
  workflows: Array<{ postId: string; platform: string; preEngagedAt: Date | null }>,
  records: DistributionMetricRecord[],
) {
  const latest = new Map<string, DistributionMetricRecord>();
  for (const record of records) {
    const key = `${record.postId}:${record.platform}`;
    const current = latest.get(key);
    if (!current || record.capturedAt > current.capturedAt) latest.set(key, record);
  }
  const assisted = new Set(
    workflows.filter((workflow) => workflow.preEngagedAt).map((workflow) => `${workflow.postId}:${workflow.platform}`),
  );
  const values = [...latest.values()];
  return {
    assisted: metricSummary(values.filter((record) => assisted.has(`${record.postId}:${record.platform}`))),
    baseline: metricSummary(values.filter((record) => !assisted.has(`${record.postId}:${record.platform}`))),
  };
}
