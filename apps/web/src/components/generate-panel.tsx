"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { waitForGeneration } from "@/lib/client/generation-progress";

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

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowEarly }),
      });
      const data = await res.json() as { error?: string; operationRunId?: string };
      if (!res.ok) {
        setError(data.error || "Generation failed");
        setLogs((current) => [...current, data.error || "failed"]);
      } else if (data.operationRunId) {
        setResult("Generation accepted. You can leave this page; the job will continue in the background.");
        const completed = await waitForGeneration(data.operationRunId, (progress) => {
          setLogs(progress.logs);
          setResult(`Background generation: ${progress.phase.replaceAll("_", " ")}…`);
        });
        if (completed.status === "failed") throw new Error(completed.error || "Generation failed");
        setResult(completed.postsCreated
          ? "Created 1 post pack. It is ready for review."
          : completed.message || "Generation checkpoint saved; cron can continue it.");
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
            <strong className="text-zinc-300">Cron already evaluates</strong> each adaptive slot
            automatically. Use this only if a tick failed or you want to draft early. Weak or
            repetitive candidates are intentionally skipped; you still approve and publish yourself.
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
            <div className="max-w-sm rounded-lg border border-teal-400/15 bg-teal-400/[0.05] px-3 py-2 text-xs text-zinc-400">
              Each accepted idea keeps both platform-native drafts. The Publishing command center
              decides whether X, LinkedIn, both, or neither should ship today.
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
            <strong className="text-violet-200">Automatic and selective:</strong> each slot uses owned
            project facts plus only its targeted lane: GitHub/official RSS, arXiv/HF, or limited HN/Reddit.
            Quality, novelty, and cooldown gates can leave the slot empty.
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
