import { NextResponse } from "next/server";
import { runCronForAllUsers } from "@/lib/ai/pipeline";
import { promoteDuePosts } from "@/lib/schedule/promote-ready";
import { runRetentionCleanup } from "@/lib/maintenance/cleanup";

export const maxDuration = 300;

/**
 * External cron target (NOT Vercel built-in cron — Hobby is max 1/day).
 *
 * Call every ~15 minutes from cron-job.org / GitHub Actions / local npm run cron:loop:
 *   GET /api/cron/slot
 *   Authorization: Bearer <CRON_SECRET>
 *
 * 1) retention cleanup (30d posts, 1d screenshots) + DB keep-alive
 * 2) promote due approved posts to ready
 * 3) generate at most one dual-format pack for the next due slot
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    // Local/dev only — production must set CRON_SECRET
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return true;
  // Fallback for schedulers that only support query strings
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const cleanup = await runRetentionCleanup();
    await promoteDuePosts();
    const result = await runCronForAllUsers();

    return NextResponse.json({
      ok: true,
      message:
        "Cron finished: cleanup + promote + at most one dual-format post per due slot. Approvals persist in Supabase.",
      cleanup: {
        postsDeleted: cleanup.postsDeleted,
        sourcesDeleted: cleanup.sourcesDeleted,
        researchRunsDeleted: cleanup.researchRunsDeleted,
        generationJobsDeleted: cleanup.generationJobsDeleted,
        screenshotsDeleted: cleanup.screenshotsDeleted,
      },
      cleanupLogs: cleanup.logs,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cron failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
