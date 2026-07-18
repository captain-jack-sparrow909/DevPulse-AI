import { prisma } from "@/lib/db";
import { projectSources, type ContentStrategyConfig } from "@/lib/content/strategy";
import type { RawSourceItem } from "@/lib/integrations/types";
import { repositoryIsStale } from "@/lib/projects/freshness";

interface ProjectFactSourceRaw {
  ownedProject: true;
  projectFactId: string;
  repositoryId: string;
  repository: string;
  evidence: unknown;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

export async function projectSourcesForUser(
  userId: string,
  strategy: ContentStrategyConfig,
): Promise<RawSourceItem[]> {
  const facts = await prisma.projectFact.findMany({
    where: { userId, reviewStatus: "approved", repository: { active: true } },
    include: { repository: true },
    orderBy: [{ useCount: "asc" }, { createdAt: "desc" }],
    take: 24,
  });
  const reviewed: RawSourceItem[] = facts.map((fact) => {
    const evidence = parseJson(fact.evidenceJson);
    return {
      provider: "project",
      externalId: `owned-intel:${fact.id}`,
      title: `${fact.repository.name}: ${fact.title}`,
      url: fact.sourceUrl,
      summary: [
        `Owned project: ${fact.repository.name} (${fact.repository.fullName})`,
        "Human-reviewed repository fact",
        `Verified claim: ${fact.claim}`,
        `Evidence record: ${JSON.stringify(evidence)}`,
      ].join("\n\n"),
      score: Math.max(245, 360 - fact.useCount * 24),
      priority: 6,
      raw: {
        ownedProject: true,
        projectFactId: fact.id,
        repositoryId: fact.repositoryId,
        repository: fact.repository.fullName,
        evidence,
      } satisfies ProjectFactSourceRaw,
    };
  });
  const repositoriesWithApprovedFacts = new Set(
    facts.map((fact) => fact.repository.fullName.toLowerCase()),
  );
  const fallback = projectSources(strategy).filter((source) => {
    const raw = source.raw && typeof source.raw === "object"
      ? source.raw as { repository?: unknown; userVerified?: unknown }
      : null;
    const repository = typeof raw?.repository === "string" ? raw.repository.toLowerCase() : "";
    return raw?.userVerified === true || !repository || !repositoriesWithApprovedFacts.has(repository);
  });
  return [...reviewed, ...fallback];
}

export async function staleProjectKnowledgeWarnings(userId: string): Promise<string[]> {
  const repositories = await prisma.ownedRepository.findMany({
    where: { userId, active: true },
    select: { name: true, lastSyncedAt: true, syncStatus: true },
    orderBy: { name: "asc" },
  });
  return repositories
    .filter((repository) => repositoryIsStale(repository.lastSyncedAt))
    .map((repository) =>
      `${repository.name} project knowledge is stale (${repository.lastSyncedAt ? `last synced ${repository.lastSyncedAt.toISOString()}` : "never synced"}; status ${repository.syncStatus})`,
    );
}

export async function markProjectFactUsed(source: RawSourceItem) {
  if (!source.raw || typeof source.raw !== "object") return;
  const factId = (source.raw as { projectFactId?: unknown }).projectFactId;
  if (typeof factId !== "string" || !factId) return;
  try {
    await prisma.projectFact.updateMany({
      where: { id: factId, reviewStatus: "approved" },
      data: { useCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  } catch (error) {
    // Usage accounting must never invalidate a post that was already saved.
    console.warn(
      "[project-intelligence] Could not update fact usage:",
      error instanceof Error ? error.message : "unknown error",
    );
  }
}
