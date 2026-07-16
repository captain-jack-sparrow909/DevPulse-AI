"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  EXPERIMENT_DIMENSIONS,
  EXPERIMENT_METRICS,
  type ExperimentDimension,
  type ExperimentMetric,
  type ExperimentPlatform,
} from "@/lib/experiments/definitions";
import type { ExperimentView } from "@/lib/experiments/service";

function statusTone(status: string): string {
  if (status === "active" || status === "applied") return "border-teal-400/20 bg-teal-400/10 text-teal-200";
  if (status === "pending") return "border-amber-400/20 bg-amber-400/10 text-amber-200";
  return "text-zinc-400";
}

function metricLabel(metric: ExperimentMetric): string {
  return EXPERIMENT_METRICS.find((item) => item.value === metric)?.label ?? metric;
}

export function ExperimentManager({ experiments }: { experiments: ExperimentView[] }) {
  const router = useRouter();
  const [platform, setPlatform] = useState<ExperimentPlatform>("x");
  const [dimension, setDimension] = useState<ExperimentDimension>("hook_pattern");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function request(key: string, url: string, method: string, body?: object) {
    setBusy(key);
    setMessage("");
    try {
      const response = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Action failed");
      router.refresh();
      setMessage("Saved. Future generation will use the current experiment state.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function create(formData: FormData) {
    await request("create", "/api/experiments", "POST", {
      name: formData.get("name"),
      hypothesis: formData.get("hypothesis"),
      platform,
      dimension,
      primaryMetric: formData.get("primaryMetric"),
      minSamplePerVariant: formData.get("minSamplePerVariant"),
    });
  }

  function changePlatform(next: ExperimentPlatform) {
    setPlatform(next);
    if (!EXPERIMENT_DIMENSIONS[dimension].platforms.includes(next)) {
      setDimension("hook_pattern");
    }
  }

  return (
    <div className="space-y-6">
      <form action={create} className="rounded-2xl border border-white/[0.07] bg-black/20 p-4 sm:p-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-1.5 text-xs text-zinc-500">
            <span>Experiment name</span>
            <Input name="name" required placeholder="Technical-tension hooks on X" />
          </label>
          <label className="space-y-1.5 text-xs text-zinc-500">
            <span>Hypothesis</span>
            <Input name="hypothesis" required placeholder="A concrete tension will earn more replies than a build-decision opening." />
          </label>
          <label className="space-y-1.5 text-xs text-zinc-500">
            <span>Target platform</span>
            <select
              value={platform}
              onChange={(event) => changePlatform(event.target.value as ExperimentPlatform)}
              className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200"
            >
              <option value="x">X</option>
              <option value="linkedin">LinkedIn</option>
            </select>
          </label>
          <label className="space-y-1.5 text-xs text-zinc-500">
            <span>One variable to test</span>
            <select
              value={dimension}
              onChange={(event) => setDimension(event.target.value as ExperimentDimension)}
              className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200"
            >
              {Object.entries(EXPERIMENT_DIMENSIONS).map(([value, definition]) => (
                <option
                  key={value}
                  value={value}
                  disabled={!definition.platforms.includes(platform)}
                >
                  {definition.label}
                </option>
              ))}
            </select>
            <p>{EXPERIMENT_DIMENSIONS[dimension].description}</p>
          </label>
          <label className="space-y-1.5 text-xs text-zinc-500">
            <span>Primary metric</span>
            <select
              name="primaryMetric"
              defaultValue="engagement_rate"
              className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200"
            >
              {EXPERIMENT_METRICS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-xs text-zinc-500">
            <span>Minimum measured posts per variant</span>
            <Input name="minSamplePerVariant" type="number" min="2" max="20" defaultValue="3" />
          </label>
        </div>
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button type="submit" disabled={busy === "create"}>
            {busy === "create" ? "Creating…" : "Create draft experiment"}
          </Button>
          <p className="text-xs text-zinc-600">Creation does not affect generation until you activate it.</p>
        </div>
      </form>

      {message && <p className="rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-sm text-zinc-300">{message}</p>}

      {experiments.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">
          No experiments yet. Create a draft above, review its variants, and activate it when ready.
        </div>
      )}

      {experiments.map((experiment) => {
        const pending = experiment.recommendations.find((item) => item.status === "pending");
        const hasDecision = experiment.recommendations.some((item) => ["applied", "rejected"].includes(item.status));
        return (
          <section key={experiment.id} className="rounded-2xl border border-white/[0.07] bg-[rgba(14,16,22,0.75)]">
            <div className="border-b border-white/[0.06] p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-zinc-50">{experiment.name}</h2>
                    <Badge className={statusTone(experiment.status)}>{experiment.status}</Badge>
                    <Badge>{experiment.platform === "x" ? "X" : "LinkedIn"}</Badge>
                  </div>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-400">{experiment.hypothesis}</p>
                  <p className="mt-1 text-xs text-zinc-600">
                    {metricLabel(experiment.primaryMetric)} · minimum {experiment.minSamplePerVariant} measured posts per variant
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {experiment.status !== "active" && experiment.status !== "completed" && (
                    <Button
                      size="sm"
                      disabled={!!busy}
                      onClick={() => request(`activate-${experiment.id}`, `/api/experiments/${experiment.id}`, "PATCH", { action: "activate" })}
                    >
                      Activate
                    </Button>
                  )}
                  {experiment.status === "active" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!!busy}
                      onClick={() => request(`pause-${experiment.id}`, `/api/experiments/${experiment.id}`, "PATCH", { action: "pause" })}
                    >
                      Pause
                    </Button>
                  )}
                  {experiment.status === "draft" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!busy}
                      onClick={() => request(`delete-${experiment.id}`, `/api/experiments/${experiment.id}`, "DELETE")}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
              {experiment.result.variants.map((variant) => (
                <div key={variant.id} className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-medium text-zinc-100">{variant.label}</h3>
                    {experiment.result.winner?.id === variant.id && <Badge className="border-teal-400/20 bg-teal-400/10 text-teal-200">Leads</Badge>}
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div><div className="text-zinc-600">Assigned</div><div className="mt-1 font-mono text-zinc-200">{variant.assignedPosts}</div></div>
                    <div><div className="text-zinc-600">Measured</div><div className="mt-1 font-mono text-zinc-200">{variant.sampleSize}/{experiment.minSamplePerVariant}</div></div>
                    <div><div className="text-zinc-600">{metricLabel(experiment.primaryMetric)}</div><div className="mt-1 font-mono text-teal-300">{variant.metricValue.toFixed(2)}%</div></div>
                  </div>
                  <div className="mt-3 text-xs text-zinc-600">
                    {variant.impressions.toLocaleString()} impressions · {variant.engagements.toLocaleString()} actions
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-white/[0.06] p-4 sm:p-5">
              <p className="text-sm text-zinc-400">{experiment.result.rationale}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {experiment.result.status === "winner" && !pending && !hasDecision && (
                  <Button
                    size="sm"
                    disabled={!!busy}
                    onClick={() => request(`recommend-${experiment.id}`, `/api/experiments/${experiment.id}/recommend`, "POST")}
                  >
                    Create recommendation
                  </Button>
                )}
                {pending && (
                  <>
                    <Button
                      size="sm"
                      disabled={!!busy}
                      onClick={() => request(`apply-${pending.id}`, `/api/recommendations/${pending.id}`, "PATCH", { action: "apply" })}
                    >
                      Apply {pending.winnerLabel || "winner"}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!!busy}
                      onClick={() => request(`reject-${pending.id}`, `/api/recommendations/${pending.id}`, "PATCH", { action: "reject" })}
                    >
                      Reject
                    </Button>
                  </>
                )}
                {experiment.recommendations.map((recommendation) => (
                  <Badge key={recommendation.id} className={statusTone(recommendation.status)}>
                    Recommendation {recommendation.status}
                  </Badge>
                ))}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
