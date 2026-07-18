"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { waitForGeneration } from "@/lib/client/generation-progress";

export type SlotBoardItem = {
  slotIndex: number;
  scheduledForLabel: string;
  isDue: boolean;
  isFilled: boolean;
  isSkipped: boolean;
  postId: string | null;
  postStatus: string | null;
  postTitle: string | null;
  platform: string | null;
  scoreOverall: number | null;
};

export function SlotBoard({
  slots,
  adaptiveCadence,
}: {
  slots: SlotBoardItem[];
  adaptiveCadence: boolean;
}) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [logs, setLogs] = useState<string[]>([]);

  async function skipSlot(slotIndex: number) {
    if (
      !confirm(
        `Skip slot ${slotIndex + 1} for today?\n\nNo post will be generated for this slot. You can Regenerate later if you change your mind.`,
      )
    ) {
      return;
    }
    setBusyKey(`skip-${slotIndex}`);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip", slotIndex }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Skip failed");
      } else {
        setMessage(data.message || `Slot ${slotIndex + 1} skipped`);
        router.refresh();
      }
    } catch {
      setError("Network error");
    } finally {
      setBusyKey(null);
    }
  }

  async function regenerateSlot(slotIndex: number) {
    if (
      !confirm(
        `Regenerate slot ${slotIndex + 1}?\n\nThe current post will be deleted and replaced with a fresh research + write run. Manual regeneration ignores the 36-hour project cooldown.`,
      )
    ) {
      return;
    }
    setBusyKey(`regen-${slotIndex}`);
    setError("");
    setMessage("");
    setLogs([`Regenerating slot ${slotIndex + 1}…`]);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate", slotIndex, regenerate: true }),
      });
      const data = await res.json() as { error?: string; operationRunId?: string };
      if (!res.ok) {
        setError(data.error || "Regenerate failed");
        setLogs((current) => [...current, data.error || "failed"]);
      } else if (data.operationRunId) {
        setMessage("Regeneration accepted. It will continue even if you leave this page.");
        const completed = await waitForGeneration(data.operationRunId, (progress) => {
          setLogs(progress.logs);
          setMessage(`Regenerating slot ${slotIndex + 1}: ${progress.phase.replaceAll("_", " ")}…`);
        });
        if (completed.status === "failed") throw new Error(completed.error || "Regeneration failed");
        setMessage(completed.postsCreated
          ? `New post for slot ${slotIndex + 1} is ready for review.`
          : completed.message || "Generation checkpoint saved.");
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Network error");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s slot board</CardTitle>
          <CardDescription>
            Cron auto-preps each high-confidence draft slot ~50 min before its time and{" "}
            <strong className="text-zinc-300">retries empty due slots every 15 min</strong> — you
            should not need Regenerate for a missing post. {adaptiveCadence && (
              <>A slot can stay intentionally empty when every draft fails the quality, novelty, evidence, or cooldown gate. </>
            )}Use{" "}
            <strong className="text-zinc-300">Skip</strong> to leave a window empty, or{" "}
            <strong className="text-zinc-300">Regenerate</strong> only if you dislike a draft.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {slots.map((slot) => {
              const n = slot.slotIndex + 1;
              const tone = slot.isSkipped
                ? "border-white/[0.06] bg-white/[0.02] text-zinc-400"
                : slot.isFilled
                  ? "border-teal-500/25 bg-teal-500/[0.07] text-teal-50"
                  : slot.isDue
                    ? "border-amber-400/30 bg-amber-400/[0.08] text-amber-50 shadow-[0_0_24px_-12px_rgba(251,191,36,0.5)]"
                    : "border-white/[0.06] bg-black/25 text-zinc-400";

              return (
                <div key={slot.slotIndex} className={`rounded-2xl border p-3.5 text-sm transition ${tone}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-inherit">
                        Slot {n}
                        <span className="ml-1.5 text-xs font-normal opacity-70">
                          · X + LinkedIn draft pack
                        </span>
                      </div>
                      <div className="mt-0.5 text-xs opacity-80">{slot.scheduledForLabel}</div>
                    </div>
                    <span className="shrink-0 rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide opacity-80">
                      {slot.isSkipped
                        ? "Skipped"
                        : slot.isFilled
                          ? slot.postStatus === "pending_review"
                            ? "Review"
                            : slot.postStatus || "Filled"
                          : slot.isDue
                            ? "Due · auto-retry"
                            : "Later · auto-prep"}
                    </span>
                  </div>

                  {slot.postTitle && !slot.isSkipped && (
                    <p className="mt-2 line-clamp-2 text-xs opacity-90">{slot.postTitle}</p>
                  )}
                  {slot.isSkipped && (
                    <p className="mt-2 text-xs opacity-70">Intentionally empty for today.</p>
                  )}
                  {slot.scoreOverall != null && !slot.isSkipped && (
                    <p className="mt-1 text-[11px] opacity-70">Score {slot.scoreOverall.toFixed(1)}</p>
                  )}

                  <div className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap">
                    {slot.postId && !slot.isSkipped && (
                      <Link href={`/posts/${slot.postId}`} className="w-full sm:w-auto">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="w-full sm:w-auto"
                          disabled={!!busyKey}
                        >
                          Open
                        </Button>
                      </Link>
                    )}
                    {(slot.isFilled || slot.isDue || slot.isSkipped) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full sm:w-auto"
                        disabled={!!busyKey}
                        onClick={() => regenerateSlot(slot.slotIndex)}
                      >
                        {busyKey === `regen-${slot.slotIndex}` ? "Working…" : "Regenerate"}
                      </Button>
                    )}
                    {!slot.isSkipped && (slot.isFilled || slot.isDue) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full sm:w-auto"
                        disabled={!!busyKey}
                        onClick={() => skipSlot(slot.slotIndex)}
                      >
                        {busyKey === `skip-${slot.slotIndex}` ? "…" : "Skip"}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {error && <p className="mt-4 text-sm text-rose-400">{error}</p>}
          {message && <p className="mt-4 text-sm text-emerald-400">{message}</p>}
        </CardContent>
      </Card>

      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Regenerate logs</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-60 overflow-auto rounded-lg bg-zinc-950 p-3 font-mono text-xs text-zinc-400">
              {logs.join("\n")}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
