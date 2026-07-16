import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ensureOwnedRepositories } from "@/lib/projects/repositories";
import { PageHeader } from "@/components/page-header";
import { ProjectIntelligence } from "@/components/project-intelligence";

function parseFiles(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export default async function ProjectsPage() {
  const session = await requireUser();
  await ensureOwnedRepositories(session.user.id);
  const [repositories, facts, ignoredChanges] = await Promise.all([
    prisma.ownedRepository.findMany({
      where: { userId: session.user.id },
      include: { _count: { select: { changes: true, facts: true } } },
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    }),
    prisma.projectFact.findMany({
      where: { userId: session.user.id },
      include: {
        repository: { select: { name: true, fullName: true } },
        change: { select: { kind: true, externalId: true, changedFilesJson: true, occurredAt: true } },
      },
      orderBy: [{ reviewStatus: "asc" }, { createdAt: "desc" }],
      take: 60,
    }),
    prisma.repositoryChange.findMany({
      where: { repository: { userId: session.user.id }, status: "noise" },
      include: { repository: { select: { name: true } } },
      orderBy: { occurredAt: "desc" },
      take: 12,
    }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Evidence before narrative"
        title="Project intelligence"
        description="Sync owned GitHub repositories, filter routine engineering noise, and approve only facts you want DevPulse to use in posts and visual assets."
      />
      <ProjectIntelligence
        repositories={repositories.map((repository) => ({
          id: repository.id,
          name: repository.name,
          fullName: repository.fullName,
          url: repository.url,
          active: repository.active,
          syncStatus: repository.syncStatus,
          lastSyncedAt: repository.lastSyncedAt?.toISOString() ?? null,
          lastError: repository.lastError,
          changeCount: repository._count.changes,
          factCount: repository._count.facts,
        }))}
        facts={facts.map((fact) => ({
          id: fact.id,
          repositoryName: fact.repository.name,
          fullName: fact.repository.fullName,
          title: fact.title,
          claim: fact.claim,
          sourceUrl: fact.sourceUrl,
          confidence: fact.confidence,
          reviewStatus: fact.reviewStatus,
          useCount: fact.useCount,
          lastUsedAt: fact.lastUsedAt?.toISOString() ?? null,
          createdAt: fact.createdAt.toISOString(),
          kind: fact.change?.kind ?? "manual",
          externalId: fact.change?.externalId ?? "",
          occurredAt: fact.change?.occurredAt.toISOString() ?? fact.createdAt.toISOString(),
          changedFiles: fact.change ? parseFiles(fact.change.changedFilesJson) : [],
        }))}
        ignoredChanges={ignoredChanges.map((change) => ({
          id: change.id,
          repositoryName: change.repository.name,
          title: change.title,
          kind: change.kind,
          reason: change.noiseReason ?? "Below the meaningful-change threshold",
          score: change.significanceScore,
          url: change.url,
          occurredAt: change.occurredAt.toISOString(),
        }))}
      />
    </div>
  );
}
