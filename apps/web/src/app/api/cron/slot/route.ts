import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runCronPhaseForAllUsers } from "@/lib/ai/phased-pipeline";
import { promoteDuePosts } from "@/lib/schedule/promote-ready";
import { runRetentionCleanup } from "@/lib/maintenance/cleanup";

/** Hobby max 60s — we pack several phases into this window (no self-fetch). */
export const maxDuration = 60;

/**
 * Multi-phase cron (Vercel Hobby safe):
 *
 * Research is still split into chunks (HN → code → blogs → discovery → write),
 * but phases run **sequentially in one invocation** until ~52s is used.
 * Incomplete jobs resume on the **next external cron** (every 15 min).
 *
 * Why not self-fetch chaining?
 * Vercel returns **508 Infinite loop detected** when /api/cron/slot fetches itself
 * (your depth=4 write step was killed that way after research succeeded).
 *
 * Auth: Authorization: Bearer <CRON_SECRET>  or  ?secret=<CRON_SECRET>
 * Debug: ?wait=1 runs work sync and returns the full JSON result.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

async function runCronWork(): Promise<{
  ok: boolean;
  message: string;
  created?: number;
  users?: number;
  needsAnotherTick?: boolean;
  results?: Array<{
    userId: string;
    postsCreated: number;
    skipReason?: string;
    phase?: string;
    continueChain?: boolean;
  }>;
  cleanup?: Record<string, number>;
  error?: string;
}> {
  try {
    const result = await runCronPhaseForAllUsers();
    await promoteDuePosts();

    let cleanup: Awaited<ReturnType<typeof runRetentionCleanup>> | undefined;
    // Cleanup only when fully idle (no post and nothing left mid-job)
    if (result.created === 0 && !result.continueChain) {
      cleanup = await runRetentionCleanup();
    }

    return {
      ok: true,
      message: result.continueChain
        ? "Phases ran until time budget; job incomplete — next 15‑min cron will continue (including write)."
        : result.created
          ? "Post created from chunked research."
          : "Nothing due / all caught up.",
      created: result.created,
      users: result.users,
      needsAnotherTick: result.continueChain,
      results: result.results,
      cleanup: cleanup
        ? {
            postsDeleted: cleanup.postsDeleted,
            sourcesDeleted: cleanup.sourcesDeleted,
            researchRunsDeleted: cleanup.researchRunsDeleted,
            generationJobsDeleted: cleanup.generationJobsDeleted,
            screenshotsDeleted: cleanup.screenshotsDeleted,
            visualAssetsDeleted: cleanup.visualAssetsDeleted,
            attributionWindowsDeleted: cleanup.attributionWindowsDeleted,
          }
        : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cron failed";
    console.error("[cron/slot]", message);
    return { ok: false, message: "Cron failed", error: message };
  }
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  // Legacy worker=1 still works as a full budget run (no chaining)
  const waitForResult =
    url.searchParams.get("wait") === "1" ||
    url.searchParams.get("worker") === "1" ||
    process.env.CRON_SYNC === "1";

  if (waitForResult) {
    const result = await runCronWork();
    console.log(
      `[cron/slot] sync done created=${result.created} needsAnotherTick=${result.needsAnotherTick} ok=${result.ok}`,
    );
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  // Async: 202 for cron-job.org 30s cap. Work runs in THIS invocation via waitUntil
  // (no self-HTTP — avoids Vercel 508 Infinite loop).
  const work = runCronWork()
    .then((result) => {
      console.log(
        `[cron/slot] background ok created=${result.created} needsAnotherTick=${result.needsAnotherTick}`,
      );
      return result;
    })
    .catch((err) => {
      console.error(
        "[cron/slot] background threw:",
        err instanceof Error ? err.message : err,
      );
    });

  try {
    waitUntil(work);
  } catch {
    void work;
  }

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      message:
        "Cron accepted. Running chunked research+write in this invocation (up to ~52s). If unfinished, the next 15‑min tick continues — no self-fetch chain (avoids Vercel 508).",
    },
    { status: 202 },
  );
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
