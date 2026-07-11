import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";

export default async function ResearchPage() {
  await requireUser();

  const [sources, runs] = await Promise.all([
    prisma.source.findMany({
      orderBy: { fetchedAt: "desc" },
      take: 60,
    }),
    prisma.researchRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
  ]);

  const byProvider = sources.reduce<Record<string, number>>((acc, s) => {
    acc[s.provider] = (acc[s.provider] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Research feed</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Ingested signals from free sources. Generation jobs refresh this store.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(byProvider).map(([provider, count]) => (
          <Badge key={provider} className="border-zinc-700 bg-zinc-800/60 text-zinc-300">
            {provider}: {count}
          </Badge>
        ))}
        {sources.length === 0 && (
          <p className="text-sm text-zinc-500">No sources yet — run Generate once.</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Latest sources</CardTitle>
            <CardDescription>Deduplicated across providers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {sources.map((s) => (
              <a
                key={s.id}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3 transition hover:border-zinc-700"
              >
                <div className="flex items-center gap-2">
                  <Badge className="border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                    {s.provider}
                  </Badge>
                  <span className="text-xs text-zinc-500">score {s.score}</span>
                </div>
                <p className="mt-1.5 text-sm text-zinc-200">{s.title}</p>
                {s.summary && (
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{s.summary}</p>
                )}
              </a>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Research runs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {runs.length === 0 && <p className="text-sm text-zinc-500">No runs yet.</p>}
            {runs.map((r) => (
              <div key={r.id} className="rounded-lg border border-zinc-800 px-3 py-2 text-sm">
                <div className="text-zinc-200">
                  {r.status} · {r.sourcesFound} sources
                </div>
                <div className="text-xs text-zinc-500">
                  {formatDistanceToNow(r.startedAt, { addSuffix: true })}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
