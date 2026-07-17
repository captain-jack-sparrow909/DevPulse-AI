import assert from "node:assert/strict";
import test from "node:test";
import { validateDeploymentEnvironment } from "@/lib/operations/config";
import { buildOperationsReport, latestHealthByService } from "@/lib/operations/report";
import { classifyOperationalError } from "@/lib/operations/store";

test("deployment validation never returns secret values", () => {
  const secret = "x".repeat(40);
  const checks = validateDeploymentEnvironment({
    NODE_ENV: "production" as const,
    VERCEL: "1",
    DATABASE_URL: "postgresql://example:6543/db",
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: "https://devpulse.example",
    NEXT_PUBLIC_APP_URL: "https://devpulse.example",
    CRON_SECRET: secret,
    DEEPSEEK_API_KEY: secret,
    CLOUDFLARE_S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
    CLOUDFLARE_ACCESS_KEY_ID: secret,
    CLOUDFLARE_SECRET_ACCESS_KEY: secret,
    R2_BUCKET: "assets",
    GITHUB_TOKEN: secret,
  });
  assert.ok(checks.every((check) => check.status === "ready"));
  assert.doesNotMatch(JSON.stringify(checks), new RegExp(secret));
});

test("local production smoke URLs may use HTTP but remote production URLs may not", () => {
  const base = {
    NODE_ENV: "production" as const,
    DATABASE_URL: "postgresql://example:6543/db",
    BETTER_AUTH_SECRET: "x".repeat(40),
    CRON_SECRET: "x",
    CLOUDFLARE_S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
    CLOUDFLARE_ACCESS_KEY_ID: "x",
    CLOUDFLARE_SECRET_ACCESS_KEY: "x",
    R2_BUCKET: "assets",
  };
  const local = validateDeploymentEnvironment({ ...base, BETTER_AUTH_URL: "http://localhost:3100", NEXT_PUBLIC_APP_URL: "http://localhost:3100" });
  const remote = validateDeploymentEnvironment({ ...base, BETTER_AUTH_URL: "http://devpulse.example", NEXT_PUBLIC_APP_URL: "http://devpulse.example" });
  assert.equal(local.find((item) => item.key === "app_url")?.status, "ready");
  assert.equal(remote.find((item) => item.key === "app_url")?.status, "missing");
});

test("latest health keeps only the newest snapshot for each service", () => {
  const latest = latestHealthByService([
    { service: "database", status: "unhealthy", latencyMs: 50, message: "old", checkedAt: new Date("2026-07-01") },
    { service: "database", status: "healthy", latencyMs: 10, message: "new", checkedAt: new Date("2026-07-02") },
    { service: "r2", status: "healthy", latencyMs: 30, message: "ok", checkedAt: new Date("2026-07-02") },
  ]);
  assert.equal(latest.length, 2);
  assert.equal(latest.find((item) => item.service === "database")?.message, "new");
});

test("operations report calculates success and slowest stage", () => {
  const report = buildOperationsReport({
    now: new Date("2026-07-17T12:00:00Z"),
    runs: [
      { id: "1", kind: "generation", status: "completed", stage: "completed", source: "cron", durationMs: 1_000, startedAt: new Date("2026-07-17T10:00:00Z"), events: [{ stage: "research", durationMs: 700 }] },
      { id: "2", kind: "generation", status: "failed", stage: "write", source: "cron", durationMs: 2_000, startedAt: new Date("2026-07-17T11:00:00Z"), events: [{ stage: "write", durationMs: 1_500 }] },
    ],
    health: [],
  });
  assert.equal(report.successRate, 50);
  assert.equal(report.averageDurationMs, 1_500);
  assert.equal(report.slowestStage?.stage, "write");
});

test("operational errors produce actionable stable codes", () => {
  assert.equal(classifyOperationalError(new Error("request timed out")).code, "timeout");
  assert.equal(classifyOperationalError(new Error("P1001 cannot reach database")).code, "database");
  assert.match(classifyOperationalError(new Error("R2 upload failed")).recoveryAction, /R2/i);
});
