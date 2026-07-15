"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function GeneratePanel({
  aiReady,
  slotSummary,
}: {
  aiReady: boolean;
  slotSummary?: {
    timezone: string;
    filledToday: number;
    postsPerDay: number;
    nextDueLabel: string | null;
    nextUpcomingLabel: string | null;
  };
}) {
  const router = useRouter();
  const [platforms, setPlatforms] = useState({ x: true, linkedin: true });
  const [allowEarly, setAllowEarly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState("");

  async function run() {
    setLoading(true);
    setError("");
    setResult("");
    setLogs(["Starting slot pipeline (1 post only)…"]);

    const selected = [
      ...(platforms.x ? (["x"] as const) : []),
      ...(platforms.linkedin ? (["linkedin"] as const) : []),
    ];
    if (selected.length === 0) {
      setError("Select at least one platform");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: selected, allowEarly }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Generation failed");
        setLogs((l) => [...l, ...(data.logs || [data.error || "failed"])]);
      } else {
        setLogs(data.logs || []);
        if (data.skipped) {
          setResult(data.skipReason || "Nothing to generate right now.");
        } else {
          setResult(
            `Created 1 post for slot ${(data.slotIndex ?? 0) + 1} from ${data.sourcesFound} live sources. Review it, then wait for the next slot for a fresh research run.`,
          );
        }
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Manual override (1 post)</CardTitle>
          <CardDescription>
            <strong className="text-zinc-300">Cron already generates</strong> each due slot
            automatically (6:00 → 21:00 UAE). Use this only if a tick failed or you want to draft
            early. You still approve and post yourself — generation never waits for a button click.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {slotSummary && (
            <div className="space-y-1.5 rounded-xl border border-white/[0.07] bg-black/30 px-3.5 py-3.5 text-sm text-zinc-300">
              <div>
                Timezone: <span className="text-zinc-100">{slotSummary.timezone}</span>
              </div>
              <div>
                Today:{" "}
                <span className="text-zinc-100">
                  {slotSummary.filledToday}/{slotSummary.postsPerDay}
                </span>{" "}
                slots filled
              </div>
              <div>
                Next due to generate:{" "}
                <span className="text-cyan-300">
                  {slotSummary.nextDueLabel || "none (all due slots filled or none due yet)"}
                </span>
              </div>
              {slotSummary.nextUpcomingLabel && (
                <div>
                  Upcoming slot:{" "}
                  <span className="text-zinc-100">{slotSummary.nextUpcomingLabel}</span>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-6">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">Platforms (alternate by slot)</label>
              <div className="flex gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={platforms.x}
                    onChange={(e) => setPlatforms((p) => ({ ...p, x: e.target.checked }))}
                  />
                  X
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={platforms.linkedin}
                    onChange={(e) => setPlatforms((p) => ({ ...p, linkedin: e.target.checked }))}
                  />
                  LinkedIn
                </label>
              </div>
            </div>
            <div>
              <label className="mb-1 flex items-center gap-2 text-xs text-zinc-400">
                <input
                  type="checkbox"
                  checked={allowEarly}
                  onChange={(e) => setAllowEarly(e.target.checked)}
                />
                Allow early (next unfilled slot before due time)
              </label>
              <p className="text-[11px] text-zinc-500 max-w-xs">
                Off by default: only generates when a slot time has arrived. Turn on only if you want
                to draft the next slot ahead of schedule.
              </p>
            </div>
          </div>

          <div
            className={`rounded-lg border px-3 py-2 text-xs ${
              aiReady
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                : "border-amber-500/30 bg-amber-500/10 text-amber-200"
            }`}
          >
            {aiReady
              ? "DeepSeek API key detected — full writer + scorer enabled."
              : "Demo mode: real research sources, template writer. Add DEEPSEEK_API_KEY for LLM posts."}
          </div>

          <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-2 text-xs text-violet-100/90">
            <strong className="text-violet-200">Automatic (product-first):</strong> each slot uses owned
            project facts plus only its targeted lane: GitHub/official RSS, arXiv/HF, or limited HN/Reddit.
            Sources save between chunks. If time runs out, the{" "}
            <strong className="text-violet-100">next 15‑min cron continues</strong> (including write).
            No self-HTTP chain (Vercel blocks that with 508). Screenshots: Recapture on the post.
          </div>

          <Button onClick={run} disabled={loading} size="lg" className="w-full sm:w-auto" variant="secondary">
            {loading ? "Researching + writing this slot…" : "Run override now"}
          </Button>

          {error && <p className="text-sm text-rose-400">{error}</p>}
          {result && <p className="text-sm text-emerald-400">{result}</p>}
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pipeline logs</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-80 overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-400">
              {logs.join("\n")}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
