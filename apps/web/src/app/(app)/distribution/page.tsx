import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { DistributionWorkspace } from "@/components/distribution-workspace";
import {
  buildDistributionComparison,
  nextWorkflowAction,
  type WorkflowAction,
} from "@/lib/distribution/service";
import { rankOpportunity } from "@/lib/distribution/ranking";

function actionKey(workflow: {
  assetReadyAt: Date | null;
  preEngagedAt: Date | null;
  publishedAt: Date | null;
  commentsReviewedAt: Date | null;
  metricsCapturedAt: Date | null;
  completedAt: Date | null;
}): WorkflowAction | null {
  if (!workflow.assetReadyAt) return "asset_ready";
  if (!workflow.preEngagedAt) return "pre_engaged";
  if (!workflow.publishedAt) return "published";
  if (!workflow.commentsReviewedAt) return "comments_reviewed";
  if (!workflow.metricsCapturedAt) return "metrics_captured";
  if (!workflow.completedAt) return "complete";
  return null;
}

export default async function DistributionPage() {
  const session = await requireUser();
  const userId = session.user.id;
  const [workflows, opportunities, relationships, signals, snapshots, allWorkflows] = await Promise.all([
    prisma.distributionWorkflow.findMany({
      where: { userId, status: { not: "completed" } },
      include: {
        post: {
          select: {
            id: true,
            title: true,
            hook: true,
            status: true,
            schedule: { select: { scheduledFor: true } },
          },
        },
      },
      orderBy: { updatedAt: "asc" },
      take: 24,
    }),
    prisma.engagementOpportunity.findMany({
      where: { userId, status: "new" },
      include: { relationship: { select: { priorityScore: true, status: true } } },
      orderBy: { discoveredAt: "desc" },
      take: 60,
    }),
    prisma.creatorRelationship.findMany({
      where: { userId },
      orderBy: [{ status: "asc" }, { priorityScore: "desc" }, { lastInteractionAt: "desc" }],
      take: 40,
    }),
    prisma.contentSignal.findMany({
      where: { userId, status: "saved" },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.socialPerformanceSnapshot.findMany({ where: { userId }, orderBy: { capturedAt: "desc" }, take: 250 }),
    prisma.distributionWorkflow.findMany({
      where: { userId },
      select: { postId: true, platform: true, preEngagedAt: true },
      take: 500,
    }),
  ]);

  const rankedOpportunities = opportunities
    .map((opportunity) => {
      const rank = rankOpportunity({
        context: opportunity.context,
        topic: opportunity.topic,
        author: opportunity.author,
        discoveredAt: opportunity.discoveredAt,
        status: opportunity.status,
        relationshipPriority:
          opportunity.relationship?.status === "muted"
            ? -100
            : opportunity.relationship?.priorityScore,
      });
      return { opportunity, rank };
    })
    .sort((a, b) => b.rank.score - a.rank.score)
    .slice(0, 15);
  const comparison = buildDistributionComparison(allWorkflows, snapshots);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Reach requires participation"
        title="Distribution workspace"
        description="Prepare each platform, join relevant conversations, respond after publishing, and convert real audience questions into future content—always manually."
      />
      <DistributionWorkspace
        workflows={workflows.map((workflow) => ({
          id: workflow.id,
          postId: workflow.postId,
          postTitle: workflow.post.title || workflow.post.hook || "Untitled post",
          postStatus: workflow.post.status,
          platform: workflow.platform,
          status: workflow.status,
          scheduledFor: workflow.post.schedule?.scheduledFor.toISOString() ?? null,
          nextAction: nextWorkflowAction(workflow),
          nextActionKey: actionKey(workflow),
          completedSteps: [
            workflow.assetReadyAt,
            workflow.preEngagedAt,
            workflow.publishedAt,
            workflow.commentsReviewedAt,
            workflow.metricsCapturedAt,
            workflow.completedAt,
          ].filter(Boolean).length,
        }))}
        opportunities={rankedOpportunities.map(({ opportunity, rank }) => ({
          id: opportunity.id,
          platform: opportunity.platform,
          url: opportunity.url,
          author: opportunity.author,
          topic: opportunity.topic,
          context: opportunity.context,
          suggestedReply: opportunity.suggestedReply,
          score: rank.score,
          reason: rank.reason,
        }))}
        relationships={relationships.map((relationship) => ({
          id: relationship.id,
          platform: relationship.platform,
          handle: relationship.handle,
          displayName: relationship.displayName,
          status: relationship.status,
          priorityScore: relationship.priorityScore,
          replyCount: relationship.replyCount,
          lastInteractionAt: relationship.lastInteractionAt?.toISOString() ?? null,
        }))}
        signals={signals.map((signal) => ({
          id: signal.id,
          kind: signal.kind,
          text: signal.text,
          sourceUrl: signal.sourceUrl,
          createdAt: signal.createdAt.toISOString(),
        }))}
        comparison={comparison}
      />
    </div>
  );
}
