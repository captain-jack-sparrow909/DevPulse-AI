import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { validateDeploymentEnvironment } from "@/lib/operations/config";
import { summarizeReadiness } from "@/lib/operations/readiness";

export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();
  let databaseReady = false;
  let databaseMessage = "Database query failed.";

  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseReady = true;
    databaseMessage = "Database query succeeded.";
  } catch {
    // The public response deliberately excludes connector details and secrets.
  }

  const checks = validateDeploymentEnvironment();
  const summary = summarizeReadiness(checks, databaseReady);

  return NextResponse.json(
    {
      status: summary.status,
      checkedAt: new Date().toISOString(),
      database: {
        status: databaseReady ? "ready" : "unready",
        latencyMs: Date.now() - startedAt,
        message: databaseMessage,
      },
      configuration: checks.map(({ key, label, status, message }) => ({
        key,
        label,
        status,
        message,
      })),
    },
    {
      status: summary.httpStatus,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
