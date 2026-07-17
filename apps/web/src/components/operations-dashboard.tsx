"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Gauge,
  HeartPulse,
  RefreshCw,
  RotateCcw,
  ServerCog,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ConfigCheckStatus, DeploymentConfigCheck } from "@/lib/operations/config";

type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

interface Props {
  report: {
    totalRuns: number;
    completedRuns: number;
    failedRuns: number;
    runningRuns: number;
    successRate: number;
    averageDurationMs: number;
    slowestKind: { kind: string; averageDurationMs: number } | null;
    slowestStage: { stage: string; averageDurationMs: number } | null;
    latestHealth: Array<{ service: string; status: HealthStatus; latencyMs: number | null; message: string; checkedAt: string }>;
    recommendations: string[];
  };
  configChecks: DeploymentConfigCheck[];
  runs: Array<{
    id: string;
    kind: string;
    source: string;
    status: string;
    stage: string;
    message: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    recoveryAction: string | null;
    attempt: number;
    durationMs: number | null;
    startedAt: string;
    events: Array<{ id: string; stage: string; level: string; message: string; durationMs: number | null; occurredAt: string }>;
  }>;
  recoveryItems: Array<{ id: string; kind: "generation" | "visual" | "repository"; label: string; detail: string; updatedAt: string }>;
}

function duration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1_000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

const healthStyle: Record<HealthStatus, string> = {
  healthy: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  degraded: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  unhealthy: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  unknown: "border-white/10 bg-white/[0.04] text-zinc-300",
};

const configStyle: Record<ConfigCheckStatus, string> = {
  ready: healthStyle.healthy,
  warning: healthStyle.degraded,
  missing: healthStyle.unhealthy,
};

export function OperationsDashboard({ report, configChecks, runs, recoveryItems }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function request(key: string, path: string, body?: Record<string, unknown>) {
    setBusy(key);
    setNotice(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Operation failed");
      setNotice("Operation completed. Dashboard data has been refreshed.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Operation failed");
    } finally {
      setBusy(null);
    }
  }

  const stats = [
    { label: "Success rate", value: `${report.successRate}%`, hint: `${report.completedRuns}/${report.completedRuns + report.failedRuns} finished`, icon: Gauge },
    { label: "Average runtime", value: duration(report.averageDurationMs), hint: "Last 7 days", icon: Clock3 },
    { label: "Failed", value: String(report.failedRuns), hint: `${recoveryItems.length} recoverable item(s)`, icon: AlertTriangle },
    { label: "Running", value: String(report.runningRuns), hint: `${report.totalRuns} observed runs`, icon: Activity },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-teal-400/15 bg-teal-400/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-teal-100">Live dependency verification</p>
          <p className="mt-1 text-xs leading-relaxed text-zinc-400">Runs database, DeepSeek, R2, GitHub, font-backed rendering, cron freshness, and deployment checks. No social post is published.</p>
        </div>
        <Button onClick={() => request("health", "/api/operations/health")} disabled={Boolean(busy)} className="shrink-0">
          <HeartPulse className={`h-4 w-4 ${busy === "health" ? "animate-pulse" : ""}`} />
          {busy === "health" ? "Checking…" : "Run health checks"}
        </Button>
      </div>
      {notice && <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-300">{notice}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label} className="stat-card">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">{stat.label}</span>
                  <Icon className="h-4 w-4 text-teal-300/80" />
                </div>
                <div className="mt-2 font-mono text-2xl font-semibold text-zinc-50 sm:text-3xl">{stat.value}</div>
                <div className="mt-1 text-[11px] text-zinc-600">{stat.hint}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Service health</CardTitle>
          <CardDescription>Newest persisted probe for each production dependency</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {report.latestHealth.length === 0 && <p className="text-sm text-zinc-500">No health snapshots yet. Run the first check above.</p>}
          {report.latestHealth.map((item) => (
            <div key={item.service} className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium capitalize text-zinc-100">{item.service.replaceAll("_", " ")}</span>
                <Badge className={healthStyle[item.status]}>{item.status}</Badge>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">{item.message}</p>
              <p className="mt-3 font-mono text-[10px] text-zinc-600">{item.latencyMs != null ? `${duration(item.latencyMs)} · ` : ""}{formatDistanceToNow(new Date(item.checkedAt), { addSuffix: true })}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recovery queue</CardTitle>
            <CardDescription>Retries preserve generation checkpoints and stored visual briefs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recoveryItems.length === 0 && (
              <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4 text-sm text-emerald-100">
                <CheckCircle2 className="mr-2 inline h-4 w-4" />No failed generation, visual, or repository work.
              </div>
            )}
            {recoveryItems.map((item) => {
              const key = `${item.kind}:${item.id}`;
              return (
                <div key={key} className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><Badge className={healthStyle.unhealthy}>{item.kind}</Badge><span className="truncate text-sm font-medium text-zinc-100">{item.label}</span></div>
                      <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-zinc-500">{item.detail}</p>
                      <p className="mt-2 text-[10px] text-zinc-600">{formatDistanceToNow(new Date(item.updatedAt), { addSuffix: true })}</p>
                    </div>
                    <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => request(key, "/api/operations/recovery", { kind: item.kind, id: item.id })}>
                      <RotateCcw className={`h-3.5 w-3.5 ${busy === key ? "animate-spin" : ""}`} />{busy === key ? "Retrying…" : "Retry"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Deployment readiness</CardTitle>
            <CardDescription>Presence and consistency only—secret values are never returned</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {configChecks.map((check) => (
              <div key={check.key} className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                {check.status === "ready" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" /> : check.status === "warning" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-300" />}
                <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="text-sm font-medium text-zinc-200">{check.label}</span><Badge className={configStyle[check.status]}>{check.status}</Badge></div><p className="mt-1 text-xs leading-relaxed text-zinc-500">{check.message}</p></div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent operational runs</CardTitle>
          <CardDescription>Stage-level duration, source, attempts, and actionable failures</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {runs.length === 0 && <p className="text-sm text-zinc-500">No observed runs yet. Generation, project sync, visual rendering, and health checks will appear here.</p>}
          {runs.map((run) => (
            <details key={run.id} className="group rounded-xl border border-white/[0.07] bg-black/20 open:bg-black/30">
              <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3"><ServerCog className="h-4 w-4 shrink-0 text-teal-300" /><div className="min-w-0"><p className="truncate text-sm font-medium capitalize text-zinc-100">{run.kind.replaceAll("_", " ")} · {run.stage.replaceAll("_", " ")}</p><p className="mt-1 text-[11px] text-zinc-600">{run.source} · attempt {run.attempt} · {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}</p></div></div>
                <div className="flex items-center gap-2"><Badge className={run.status === "completed" ? healthStyle.healthy : run.status === "failed" ? healthStyle.unhealthy : healthStyle.degraded}>{run.status}</Badge><span className="font-mono text-xs text-zinc-500">{duration(run.durationMs)}</span></div>
              </summary>
              <div className="border-t border-white/[0.06] px-4 py-4">
                {run.errorMessage && <div className="mb-3 rounded-lg border border-rose-400/15 bg-rose-400/[0.06] p-3 text-xs text-rose-100"><strong>{run.errorCode || "failure"}:</strong> {run.errorMessage}{run.recoveryAction && <p className="mt-1 text-rose-200/70">{run.recoveryAction}</p>}</div>}
                <div className="space-y-2">
                  {run.events.map((event) => (
                    <div key={event.id} className="flex gap-3 text-xs"><span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${event.level === "error" ? "bg-rose-400" : event.level === "warning" ? "bg-amber-400" : "bg-teal-400"}`} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium capitalize text-zinc-300">{event.stage.replaceAll("_", " ")}</span><span className="font-mono text-[10px] text-zinc-600">{duration(event.durationMs)}</span></div><p className="mt-0.5 leading-relaxed text-zinc-500">{event.message}</p></div></div>
                  ))}
                </div>
              </div>
            </details>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Operational recommendations</CardTitle><CardDescription>Evidence-bounded guidance from the last seven days</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {report.recommendations.map((recommendation) => <div key={recommendation} className="flex gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3 text-sm leading-relaxed text-zinc-400"><RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />{recommendation}</div>)}
          {(report.slowestKind || report.slowestStage) && <p className="pt-2 text-xs text-zinc-600">Slowest kind: {report.slowestKind ? `${report.slowestKind.kind.replaceAll("_", " ")} (${duration(report.slowestKind.averageDurationMs)})` : "—"} · Slowest stage: {report.slowestStage ? `${report.slowestStage.stage.replaceAll("_", " ")} (${duration(report.slowestStage.averageDurationMs)})` : "—"}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
