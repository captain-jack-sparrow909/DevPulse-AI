import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { syncStaleOwnedRepositories } from "@/lib/projects/github-sync";
import { ensureOwnedRepositories } from "@/lib/projects/repositories";
import { prisma } from "@/lib/db";
import {
  completeOperationalRun,
  failOperationalRun,
  startOperationalRun,
} from "@/lib/operations/store";

export const maxDuration = 60;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return process.env.NODE_ENV !== "production";
  const header = request.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return true;
  return new URL(request.url).searchParams.get("secret") === secret;
}

async function runRepositorySync() {
  const operation = await startOperationalRun({
    kind: "project_sync",
    source: "cron",
    stage: "syncing",
    subjectType: "stale_repository_set",
    metadata: { cadenceHours: 3.5 },
  });
  try {
    const users = await prisma.user.findMany({ select: { id: true } });
    await Promise.all(users.map((user) => ensureOwnedRepositories(user.id)));
    const results = await syncStaleOwnedRepositories();
    const failures = results.filter((result) => result.error);
    const factsCreated = results.reduce((sum, result) => sum + result.factsCreated, 0);
    const documentationFacts = results.reduce((sum, result) => sum + result.documentationFacts, 0);
    await completeOperationalRun(operation.id, {
      stage: failures.length ? "partial_failure" : "completed",
      message: results.length
        ? `Repository freshness sync checked ${results.length} stale repository(s).`
        : "All active repositories were already fresh.",
      metadata: {
        repositories: results.length,
        users: users.length,
        failures: failures.length,
        factsCreated,
        documentationFacts,
        unchanged: results.filter((result) => result.unchanged).length,
      },
    });
    return {
      ok: failures.length < results.length || results.length === 0,
      repositories: results.length,
      failures: failures.length,
      factsCreated,
      documentationFacts,
      results,
    };
  } catch (error) {
    await failOperationalRun(operation.id, error, "project_sync");
    throw error;
  }
}

export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const waitForResult = new URL(request.url).searchParams.get("wait") === "1";
  if (waitForResult) {
    try {
      return NextResponse.json(await runRepositorySync());
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Repository sync failed" },
        { status: 500 },
      );
    }
  }

  const work = runRepositorySync().catch((error) => {
    console.error("[cron/projects]", error instanceof Error ? error.message : error);
  });
  try {
    waitUntil(work);
  } catch {
    void work;
  }
  return NextResponse.json(
    { ok: true, accepted: true, message: "Repository freshness sync accepted." },
    { status: 202 },
  );
}
