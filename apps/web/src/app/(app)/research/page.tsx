import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ResearchPanel } from "@/components/research-panel";

export default async function ResearchPage() {
  await requireUser();

  const [sources, runs, grouped] = await Promise.all([
    prisma.source.findMany({
      orderBy: [{ fetchedAt: "desc" }, { score: "desc" }],
      take: 200,
    }),
    prisma.researchRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 12,
    }),
    prisma.source.groupBy({
      by: ["provider"],
      _count: { _all: true },
    }),
  ]);

  const globalByProvider: Record<string, number> = {};
  for (const g of grouped) {
    globalByProvider[g.provider] = g._count._all;
  }

  return (
    <ResearchPanel
      globalByProvider={globalByProvider}
      sources={sources.map((s) => ({
        id: s.id,
        provider: s.provider,
        title: s.title,
        url: s.url,
        summary: s.summary,
        score: s.score,
        fetchedAt: s.fetchedAt.toISOString(),
      }))}
      runs={runs.map((r) => ({
        id: r.id,
        status: r.status,
        sourcesFound: r.sourcesFound,
        startedAt: r.startedAt.toISOString(),
        error: r.error,
      }))}
    />
  );
}
