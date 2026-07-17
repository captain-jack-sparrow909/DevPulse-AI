import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ensureOwnedRepositories } from "@/lib/projects/repositories";
import { syncOwnedRepositories } from "@/lib/projects/github-sync";
import {
  completeOperationalRun,
  failOperationalRun,
  recordOperationalEvent,
  startOperationalRun,
} from "@/lib/operations/store";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  await ensureOwnedRepositories(session.user.id);
  const repositoryId = typeof body.repositoryId === "string" ? body.repositoryId : undefined;
  const operation = await startOperationalRun({
    userId: session.user.id,
    kind: "project_sync",
    source: "manual",
    stage: "syncing",
    subjectType: repositoryId ? "repository" : "repository_set",
    subjectId: repositoryId,
  });
  let results: Awaited<ReturnType<typeof syncOwnedRepositories>>;
  try {
    const started = Date.now();
    results = await syncOwnedRepositories(session.user.id, repositoryId);
    const failures = results.filter((result) => result.error);
    await recordOperationalEvent(operation.id, {
      stage: failures.length ? "partial_failure" : "synced",
      level: failures.length ? "warning" : "info",
      message: `${results.length} repository sync(s) completed; ${failures.length} failed.`,
      durationMs: Date.now() - started,
      metadata: {
        repositories: results.length,
        failures: failures.length,
        changesFound: results.reduce((sum, result) => sum + result.changesFound, 0),
      },
    });
    if (failures.length === results.length && failures.length > 0) {
      throw new Error(failures.map((result) => result.error).join("; "));
    }
    await completeOperationalRun(operation.id, {
      stage: failures.length ? "partial_failure" : "completed",
      message: failures.length ? "Repository sync completed with recoverable failures." : "Repository sync completed.",
    });
  } catch (error) {
    await failOperationalRun(operation.id, error, "project_sync");
    const message = error instanceof Error ? error.message : "Repository sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  if (repositoryId && results.length === 0) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }
  return NextResponse.json({
    results,
    totals: results.reduce(
      (total, result) => ({
        changesFound: total.changesFound + result.changesFound,
        factsCreated: total.factsCreated + result.factsCreated,
        ignoredChanges: total.ignoredChanges + result.ignoredChanges,
        failures: total.failures + (result.error ? 1 : 0),
      }),
      { changesFound: 0, factsCreated: 0, ignoredChanges: 0, failures: 0 },
    ),
  });
}
