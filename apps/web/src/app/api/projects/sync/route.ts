import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { ensureOwnedRepositories } from "@/lib/projects/repositories";
import { syncOwnedRepositories } from "@/lib/projects/github-sync";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  await ensureOwnedRepositories(session.user.id);
  const repositoryId = typeof body.repositoryId === "string" ? body.repositoryId : undefined;
  const results = await syncOwnedRepositories(session.user.id, repositoryId);
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
