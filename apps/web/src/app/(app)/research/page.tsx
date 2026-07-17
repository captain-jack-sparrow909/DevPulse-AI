import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { ResearchPanel } from "@/components/research-panel";
import { unstable_cache } from "next/cache";

const providerCounts = unstable_cache(
  async () => {
    const groups = await prisma.source.groupBy({ by: ["provider"], _count: { _all: true } });
    return groups.map((group) => ({ provider: group.provider, count: group._count._all }));
  },
  ["research-provider-counts"],
  { revalidate: 60 },
);

export default async function ResearchPage() {
  await requireUser();

  const [sources, runs, grouped] = await Promise.all([
    prisma.source.findMany({
      orderBy: [{ fetchedAt: "desc" }, { score: "desc" }],
      take: 100,
    }),
    prisma.researchRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 8,
    }),
    providerCounts(),
  ]);

  const globalByProvider: Record<string, number> = {};
  for (const g of grouped) {
    globalByProvider[g.provider] = g.count;
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
