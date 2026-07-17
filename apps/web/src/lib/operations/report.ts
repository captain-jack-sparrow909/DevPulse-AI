import type { ServiceHealthStatus } from "@/lib/operations/health";

export interface OperationRunInput {
  id: string;
  kind: string;
  status: string;
  stage: string;
  source: string;
  durationMs: number | null;
  startedAt: Date;
  events?: Array<{ stage: string; durationMs: number | null }>;
}

export interface HealthSnapshotInput {
  service: string;
  status: string;
  latencyMs: number | null;
  message: string;
  checkedAt: Date;
}

export interface OperationsReport {
  totalRuns: number;
  completedRuns: number;
  failedRuns: number;
  runningRuns: number;
  successRate: number;
  averageDurationMs: number;
  slowestKind: { kind: string; averageDurationMs: number } | null;
  slowestStage: { stage: string; averageDurationMs: number } | null;
  latestHealth: Array<{
    service: string;
    status: ServiceHealthStatus;
    latencyMs: number | null;
    message: string;
    checkedAt: Date;
  }>;
  recommendations: string[];
}

function average(values: number[]): number {
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

export function latestHealthByService(snapshots: HealthSnapshotInput[]) {
  const map = new Map<string, HealthSnapshotInput>();
  for (const snapshot of [...snapshots].sort((a, b) => b.checkedAt.getTime() - a.checkedAt.getTime())) {
    if (!map.has(snapshot.service)) map.set(snapshot.service, snapshot);
  }
  return [...map.values()];
}

export function buildOperationsReport(input: {
  runs: OperationRunInput[];
  health: HealthSnapshotInput[];
  now?: Date;
  windowDays?: number;
}): OperationsReport {
  const now = input.now ?? new Date();
  const cutoff = now.getTime() - (input.windowDays ?? 7) * 24 * 60 * 60 * 1_000;
  const runs = input.runs.filter((run) => run.startedAt.getTime() >= cutoff);
  const completedRuns = runs.filter((run) => run.status === "completed").length;
  const failedRuns = runs.filter((run) => run.status === "failed").length;
  const runningRuns = runs.filter((run) => run.status === "running").length;
  const finished = completedRuns + failedRuns;
  const durations = runs.map((run) => run.durationMs).filter((value): value is number => value != null);

  const byKind = new Map<string, number[]>();
  const byStage = new Map<string, number[]>();
  for (const run of runs) {
    if (run.durationMs != null) byKind.set(run.kind, [...(byKind.get(run.kind) ?? []), run.durationMs]);
    for (const event of run.events ?? []) {
      if (event.durationMs != null) byStage.set(event.stage, [...(byStage.get(event.stage) ?? []), event.durationMs]);
    }
  }
  const slowestKind = [...byKind.entries()]
    .map(([kind, values]) => ({ kind, averageDurationMs: average(values) }))
    .sort((a, b) => b.averageDurationMs - a.averageDurationMs)[0] ?? null;
  const slowestStage = [...byStage.entries()]
    .map(([stage, values]) => ({ stage, averageDurationMs: average(values) }))
    .sort((a, b) => b.averageDurationMs - a.averageDurationMs)[0] ?? null;
  const latestHealth = latestHealthByService(input.health).map((snapshot) => ({
    ...snapshot,
    status: (["healthy", "degraded", "unhealthy", "unknown"].includes(snapshot.status) ? snapshot.status : "unknown") as ServiceHealthStatus,
  }));
  const recommendations: string[] = [];
  if (finished < 5) recommendations.push("Collect at least five completed operational runs before treating timing averages as stable.");
  if (failedRuns > 0) recommendations.push(`${failedRuns} operation(s) failed in this window. Resolve the recovery queue before adding more scheduled work.`);
  if (finished >= 5 && completedRuns / finished < 0.9) recommendations.push("Operational success is below 90%. Prioritize the most common error code and slowest failing stage.");
  const unhealthy = latestHealth.filter((item) => item.status === "unhealthy");
  if (unhealthy.length) recommendations.push(`Unhealthy services: ${unhealthy.map((item) => item.service.replaceAll("_", " ")).join(", ")}.`);
  const staleHealth = latestHealth.filter((item) => now.getTime() - item.checkedAt.getTime() > 12 * 60 * 60 * 1_000);
  if (!latestHealth.length || staleHealth.length) recommendations.push("Run fresh service checks; health snapshots older than 12 hours are not reliable deployment evidence.");
  if (!recommendations.length) recommendations.push("Operations are healthy. Keep monitoring retries, cron freshness, and the slowest stage before changing capacity.");

  return {
    totalRuns: runs.length,
    completedRuns,
    failedRuns,
    runningRuns,
    successRate: finished ? Math.round((completedRuns / finished) * 1_000) / 10 : 0,
    averageDurationMs: average(durations),
    slowestKind,
    slowestStage,
    latestHealth,
    recommendations,
  };
}
