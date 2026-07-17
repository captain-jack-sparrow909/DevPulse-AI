import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { ExecutionPlanner } from "@/components/execution-planner";

function json<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default async function ExecutionPage() {
  const session = await requireUser();
  const plans = await prisma.weeklyExecutionPlan.findMany({
    where: { userId: session.user.id },
    include: {
      review: { select: { id: true, status: true, weekKey: true } },
      items: {
        orderBy: { sequence: "asc" },
        include: {
          post: {
            select: {
              id: true,
              status: true,
              postedManuallyAt: true,
              performanceSnapshots: { select: { capturedAt: true } },
            },
          },
        },
      },
    },
    orderBy: { periodStart: "desc" },
    take: 4,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Phase 14 · Approval-gated execution"
        title="Weekly execution plan"
        description="Turn the weekly review into seven anchor posts with explicit objectives, distribution checklists, and measurement checkpoints. Approval only guides draft generation; posting remains manual."
      />
      <ExecutionPlanner
        plans={plans.map((plan) => ({
          id: plan.id,
          weekKey: plan.weekKey,
          timezone: plan.timezone,
          status: plan.status,
          periodStart: plan.periodStart.toISOString(),
          periodEnd: plan.periodEnd.toISOString(),
          approvedAt: plan.approvedAt?.toISOString() ?? null,
          createdAt: plan.createdAt.toISOString(),
          brief: json(plan.briefJson, { focus: "", guardrail: "", experiment: "", operatingRules: [] }),
          review: plan.review,
          items: plan.items.map((item) => ({
            id: item.id,
            sequence: item.sequence,
            scheduledFor: item.scheduledFor.toISOString(),
            slotIndex: item.slotIndex,
            contentType: item.contentType,
            projectName: item.projectName,
            objective: item.objective,
            angle: item.angle,
            platforms: item.platforms,
            mediaType: item.mediaType,
            cta: json(item.ctaJson, {}),
            distribution: json(item.distributionJson, {}),
            measurement: json(item.measurementJson, {}),
            experimentId: item.experimentId,
            campaignId: item.campaignId,
            status: item.status,
            post: item.post
              ? {
                  id: item.post.id,
                  status: item.post.status,
                  postedManuallyAt: item.post.postedManuallyAt?.toISOString() ?? null,
                  snapshotTimes: item.post.performanceSnapshots.map((snapshot) => snapshot.capturedAt.toISOString()),
                }
              : null,
          })),
        }))}
      />
    </div>
  );
}
