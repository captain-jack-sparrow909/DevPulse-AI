import { prisma } from "@/lib/db";
import { isAiConfigured } from "@/lib/ai/client";
import { isR2Configured, probeR2Storage } from "@/lib/storage/r2";
import { renderVisualAsset } from "@/lib/visuals/render";
import { validateDeploymentEnvironment } from "@/lib/operations/config";
import {
  completeOperationalRun,
  failOperationalRun,
  recordOperationalEvent,
  startOperationalRun,
  type OperationSource,
} from "@/lib/operations/store";
import type { BrandConfig, VisualBrief } from "@/lib/visuals/types";

export type ServiceHealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface ServiceProbeResult {
  service: string;
  status: ServiceHealthStatus;
  latencyMs: number | null;
  message: string;
  metadata?: Record<string, unknown>;
}

async function timed(service: string, task: () => Promise<Omit<ServiceProbeResult, "service" | "latencyMs">>): Promise<ServiceProbeResult> {
  const started = Date.now();
  try {
    const result = await task();
    return { service, latencyMs: Date.now() - started, ...result };
  } catch (error) {
    return {
      service,
      status: "unhealthy",
      latencyMs: Date.now() - started,
      message: (error instanceof Error ? error.message : String(error)).slice(0, 1_000),
    };
  }
}

async function databaseProbe(): Promise<ServiceProbeResult> {
  return timed("database", async () => {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "healthy", message: "PostgreSQL query succeeded." };
  });
}

async function aiProbe(): Promise<ServiceProbeResult> {
  if (!isAiConfigured()) {
    return { service: "ai", status: "degraded", latencyMs: null, message: "DEEPSEEK_API_KEY is missing; demo writing only." };
  }
  return timed("ai", async () => {
    const base = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
    const response = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      signal: AbortSignal.timeout(7_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`DeepSeek health request returned HTTP ${response.status}`);
    return { status: "healthy", message: "DeepSeek authenticated model request succeeded." };
  });
}

async function r2Probe(): Promise<ServiceProbeResult> {
  if (!isR2Configured()) {
    return { service: "r2", status: "degraded", latencyMs: null, message: "R2 is not configured; Vercel cannot persist generated media locally." };
  }
  return timed("r2", async () => {
    await probeR2Storage();
    return { status: "healthy", message: "R2 write and cleanup probe succeeded." };
  });
}

async function githubProbe(): Promise<ServiceProbeResult> {
  return timed("github", async () => {
    const token = process.env.GITHUB_TOKEN?.trim();
    const response = await fetch("https://api.github.com/rate_limit", {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "DevPulse-AI-Health",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(7_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`GitHub health request returned HTTP ${response.status}`);
    const remaining = Number(response.headers.get("x-ratelimit-remaining") || 0);
    return {
      status: token ? "healthy" : "degraded",
      message: token ? `GitHub authenticated; ${remaining} requests remain in the current window.` : `GitHub reachable but unauthenticated; ${remaining} requests remain.`,
      metadata: { authenticated: Boolean(token), remaining },
    };
  });
}

const probeBrand: BrandConfig = {
  displayName: "DevPulse AI",
  handle: "@health",
  tagline: "Production health",
  accentColor: "#22d3ee",
  backgroundColor: "#07111f",
  textColor: "#f8fafc",
  footerText: "Visual renderer probe",
};

const probeBrief: VisualBrief = {
  eyebrow: "Health check",
  title: "Visual renderer ready",
  subtitle: "Bundled font and Sharp raster pipeline",
  bullets: ["PNG render completed", "Fontconfig loaded", "Serverless-safe output"],
  project: "DevPulse AI",
  takeaway: "Rendering dependencies are available.",
  sourceLabel: "OPERATIONS",
  altText: "DevPulse visual renderer health check",
  allowedFacts: "Visual renderer health probe",
};

async function visualProbe(): Promise<ServiceProbeResult> {
  return timed("visual_renderer", async () => {
    const output = await renderVisualAsset("portrait_card", probeBrief, probeBrand);
    if (output.file.length < 1_000) throw new Error("Visual renderer returned an unexpectedly small PNG");
    return { status: "healthy", message: `Sharp rendered a ${Math.round(output.file.length / 1_024)}KB font-backed PNG.` };
  });
}

async function cronProbe(userId: string): Promise<ServiceProbeResult> {
  const latest = await prisma.operationalRun.findFirst({
    where: { userId, source: "cron", kind: "generation" },
    orderBy: { startedAt: "desc" },
  });
  if (!latest) {
    return { service: "cron", status: process.env.NODE_ENV === "production" ? "unknown" : "degraded", latencyMs: null, message: "No observed external cron invocation yet." };
  }
  const ageMinutes = Math.round((Date.now() - latest.startedAt.getTime()) / 60_000);
  if (ageMinutes > 45) {
    return { service: "cron", status: "unhealthy", latencyMs: null, message: `Last observed cron invocation was ${ageMinutes} minutes ago; expected every 15 minutes.` };
  }
  return { service: "cron", status: latest.status === "failed" ? "unhealthy" : "healthy", latencyMs: latest.durationMs, message: `Last cron invocation was ${ageMinutes} minute(s) ago with status ${latest.status}.` };
}

function deploymentProbe(): ServiceProbeResult {
  const checks = validateDeploymentEnvironment();
  const missing = checks.filter((check) => check.status === "missing").length;
  const warnings = checks.filter((check) => check.status === "warning").length;
  return {
    service: "deployment",
    status: missing ? "unhealthy" : warnings ? "degraded" : "healthy",
    latencyMs: null,
    message: missing ? `${missing} required deployment configuration check(s) failed.` : warnings ? `${warnings} optional deployment warning(s).` : "All deployment configuration checks passed.",
    metadata: { missing, warnings },
  };
}

export async function runServiceHealthChecks(
  userId: string,
  source: OperationSource = "manual",
): Promise<{ runId: string; probes: ServiceProbeResult[] }> {
  const run = await startOperationalRun({ userId, kind: "health_check", source, stage: "probing" });
  try {
    const probes = await Promise.all([
      databaseProbe(),
      aiProbe(),
      r2Probe(),
      githubProbe(),
      visualProbe(),
      cronProbe(userId),
      Promise.resolve(deploymentProbe()),
    ]);
    await prisma.serviceHealthSnapshot.createMany({
      data: probes.map((probe) => ({
        userId,
        service: probe.service,
        status: probe.status,
        latencyMs: probe.latencyMs,
        message: probe.message.slice(0, 1_000),
        metadataJson: JSON.stringify(probe.metadata ?? {}).slice(0, 4_000),
      })),
    });
    for (const probe of probes) {
      await recordOperationalEvent(run.id, {
        stage: probe.service,
        level: probe.status === "unhealthy" ? "error" : probe.status === "degraded" || probe.status === "unknown" ? "warning" : "info",
        message: probe.message,
        durationMs: probe.latencyMs ?? undefined,
        metadata: probe.metadata,
      });
    }
    const unhealthy = probes.filter((probe) => probe.status === "unhealthy").length;
    await completeOperationalRun(run.id, {
      stage: unhealthy ? "attention_required" : "completed",
      message: unhealthy ? `Health check completed with ${unhealthy} unhealthy service(s).` : "Health check completed.",
    });
    return { runId: run.id, probes };
  } catch (error) {
    await failOperationalRun(run.id, error, "health_check");
    throw error;
  }
}

export async function refreshServiceHealthIfStale(userId: string, maxAgeMs = 6 * 60 * 60 * 1_000) {
  const latest = await prisma.serviceHealthSnapshot.findFirst({
    where: { userId },
    orderBy: { checkedAt: "desc" },
  });
  if (latest && Date.now() - latest.checkedAt.getTime() < maxAgeMs) return null;
  return runServiceHealthChecks(userId, "cron");
}
