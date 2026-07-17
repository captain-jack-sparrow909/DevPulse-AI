import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { OperationsDashboard } from "@/components/operations-dashboard";
import { buildOperationsReport } from "@/lib/operations/report";
import { validateDeploymentEnvironment } from "@/lib/operations/config";
import { markStaleOperationalWork } from "@/lib/operations/recovery";

export default async function OperationsPage() {
  const session = await requireUser();
  const userId = session.user.id;
  await markStaleOperationalWork(userId);

  const [runs, health, failedJobs, failedVisuals, failedRepositories] = await Promise.all([
    prisma.operationalRun.findMany({
      where: { userId },
      include: { events: { orderBy: { occurredAt: "asc" }, take: 30 } },
      orderBy: { startedAt: "desc" },
      take: 100,
    }),
    prisma.serviceHealthSnapshot.findMany({
      where: { userId },
      orderBy: { checkedAt: "desc" },
      take: 100,
    }),
    prisma.generationJob.findMany({
      where: { userId, status: "failed" },
      include: { researchRun: { select: { topicsRanked: true } } },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.postVisualAsset.findMany({
      where: { userId, status: "failed" },
      include: { post: { select: { title: true, hook: true } } },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.ownedRepository.findMany({
      where: { userId, active: true, syncStatus: "failed" },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
  ]);
  const report = buildOperationsReport({ runs, health });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Production control plane"
        title="Operations and reliability"
        description="Observe production attempts, verify external dependencies, detect missed cron ticks, and resume failed work from its last durable checkpoint."
      />
      <OperationsDashboard
        report={{
          ...report,
          latestHealth: report.latestHealth.map((item) => ({ ...item, checkedAt: item.checkedAt.toISOString() })),
        }}
        configChecks={validateDeploymentEnvironment()}
        runs={runs.slice(0, 30).map((run) => ({
          id: run.id,
          kind: run.kind,
          source: run.source,
          status: run.status,
          stage: run.stage,
          message: run.message,
          errorCode: run.errorCode,
          errorMessage: run.errorMessage,
          recoveryAction: run.recoveryAction,
          attempt: run.attempt,
          durationMs: run.durationMs,
          startedAt: run.startedAt.toISOString(),
          events: run.events.map((event) => ({
            id: event.id,
            stage: event.stage,
            level: event.level,
            message: event.message,
            durationMs: event.durationMs,
            occurredAt: event.occurredAt.toISOString(),
          })),
        }))}
        recoveryItems={[
          ...failedJobs.filter((job) => {
            try {
              const checkpoint = JSON.parse(job.researchRun?.topicsRanked || "null") as { kind?: string; generationJobId?: string } | null;
              return checkpoint?.kind === "phased_v1" && checkpoint.generationJobId === job.id;
            } catch {
              return false;
            }
          }).map((job) => ({
            id: job.id,
            kind: "generation" as const,
            label: `Generation job ${job.id.slice(-8)}`,
            detail: job.error || `Failed during ${job.status}`,
            updatedAt: job.updatedAt.toISOString(),
          })),
          ...failedVisuals.map((asset) => ({
            id: asset.id,
            kind: "visual" as const,
            label: `${asset.kind.replaceAll("_", " ")} · ${asset.post.title || asset.post.hook || "Untitled post"}`,
            detail: asset.error || "Visual rendering failed",
            updatedAt: asset.updatedAt.toISOString(),
          })),
          ...failedRepositories.map((repository) => ({
            id: repository.id,
            kind: "repository" as const,
            label: repository.fullName,
            detail: repository.lastError || "Repository sync failed",
            updatedAt: repository.updatedAt.toISOString(),
          })),
        ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))}
      />
    </div>
  );
}
