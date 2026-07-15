"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

export type ResearchSourceRow = {
  id: string;
  provider: string;
  title: string;
  url: string;
  summary: string | null;
  score: number;
  fetchedAt: string;
};

export type ResearchRunRow = {
  id: string;
  status: string;
  sourcesFound: number;
  startedAt: string;
  error: string | null;
};

export function ResearchPanel({
  sources,
  runs,
  globalByProvider,
}: {
  sources: ResearchSourceRow[];
  runs: ResearchRunRow[];
  globalByProvider: Record<string, number>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<string>("all");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<string[]>([]);

  const providers = useMemo(() => {
    return Object.keys(globalByProvider).sort(
      (a, b) => (globalByProvider[b] || 0) - (globalByProvider[a] || 0),
    );
  }, [globalByProvider]);

  const filtered = useMemo(() => {
    if (filter === "all") return sources;
    return sources.filter((s) => s.provider === filter);
  }, [sources, filter]);

  async function refresh() {
    setLoading(true);
    setError("");
    setMessage("");
    setLogs(["Refreshing the product-relevant research feed…"]);
    try {
      const res = await fetch("/api/research/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Refresh failed");
        setLogs((l) => [...l, data.error || "failed"]);
      } else {
        setLogs(data.logs || []);
        setMessage(
          `Ingested ${data.sourcesFound} sources · ${data.mix || Object.entries(data.byProvider || {})
            .map(([k, v]) => `${k}:${v}`)
            .join(" · ")}`,
        );
        startTransition(() => router.refresh());
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="page-kicker mb-2">Signals</div>
          <h1 className="page-title">Research feed</h1>
          <p className="page-subtitle">
            Product-relevant catalog: priority-5 official AI/engineering blogs, GitHub, arXiv,
            Hugging Face, and limited HN/Reddit. Refresh without generating a post.
          </p>
        </div>
        <Button
          onClick={refresh}
          disabled={loading || pending}
          className="w-full shrink-0 sm:w-auto"
        >
          {loading ? "Fetching targeted sources…" : "Refresh research now"}
        </Button>
      </div>

      {error && <p className="text-sm text-rose-400">{error}</p>}
      {message && <p className="text-sm text-emerald-400 break-words">{message}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`rounded-full border px-2.5 py-0.5 text-xs ${
            filter === "all"
              ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-200"
              : "border-zinc-700 bg-zinc-800/60 text-zinc-300"
          }`}
        >
          all: {Object.values(globalByProvider).reduce((a, b) => a + b, 0)}
        </button>
        {providers.map((provider) => (
          <button
            type="button"
            key={provider}
            onClick={() => setFilter(provider)}
            className={`rounded-full border px-2.5 py-0.5 text-xs ${
              filter === provider
                ? "border-cyan-500/40 bg-cyan-500/15 text-cyan-200"
                : "border-zinc-700 bg-zinc-800/60 text-zinc-300"
            }`}
          >
            {provider}: {globalByProvider[provider]}
          </button>
        ))}
        {providers.length === 0 && (
          <p className="text-sm text-zinc-500">No sources yet — click Refresh research now.</p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Latest sources</CardTitle>
            <CardDescription>
              {filter === "all" ? "All providers" : `Filter: ${filter}`} · showing {filtered.length}
            </CardDescription>
          </CardHeader>
          <CardContent className="max-h-[70vh] space-y-2 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-sm text-zinc-500">
                Nothing for this filter. Run a refresh or pick another provider.
              </p>
            )}
            {filtered.map((s) => (
              <a
                key={s.id}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="list-row"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="border-cyan-500/20 bg-cyan-500/10 text-cyan-300">
                    {s.provider}
                  </Badge>
                  <span className="text-xs text-zinc-500">score {Math.round(s.score)}</span>
                  <span className="text-xs text-zinc-600">
                    {formatDistanceToNow(new Date(s.fetchedAt), { addSuffix: true })}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-zinc-200">{s.title}</p>
                {s.summary && (
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{s.summary}</p>
                )}
              </a>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
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
                    {formatDistanceToNow(new Date(r.startedAt), { addSuffix: true })}
                  </div>
                  {r.error && <div className="mt-1 text-xs text-rose-400">{r.error}</div>}
                </div>
              ))}
            </CardContent>
          </Card>

          {logs.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Refresh logs</CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="max-h-48 overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-400">
                  {logs.join("\n")}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
