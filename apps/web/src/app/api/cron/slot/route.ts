import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runCronForAllUsers } from "@/lib/ai/pipeline";
import { promoteDuePosts } from "@/lib/schedule/promote-ready";
import { runRetentionCleanup } from "@/lib/maintenance/cleanup";

/** Hobby max is 60s; Pro can raise this. */
export const maxDuration = 60;

/**
 * External cron target (cron-job.org / GitHub Actions / local loop).
 *
 * Returns quickly (202) so external schedulers don't time out, then continues
 * work via waitUntil() up to maxDuration:
 * 1) retention cleanup + DB keep-alive
 * 2) promote due approved posts
 * 3) generate at most one dual pack for the next due slot
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 *   or  ?secret=<CRON_SECRET>
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
  cleanup?: Record<string, number>;
  created?: number;
  users?: number;
  error?: string;
}> {
  try {
    const cleanup = await runRetentionCleanup();
    await promoteDuePosts();
    const result = await runCronForAllUsers();
    return {
      ok: true,
      message:
        "Cron finished: cleanup + promote + at most one dual-format post per due slot.",
      cleanup: {
        postsDeleted: cleanup.postsDeleted,
        sourcesDeleted: cleanup.sourcesDeleted,
        researchRunsDeleted: cleanup.researchRunsDeleted,
        generationJobsDeleted: cleanup.generationJobsDeleted,
        screenshotsDeleted: cleanup.screenshotsDeleted,
      },
      created: result.created,
      users: result.users,
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
  // ?wait=1 forces full synchronous run (for local debugging)
  const waitForResult = url.searchParams.get("wait") === "1";

  if (waitForResult || process.env.CRON_SYNC === "1") {
    const result = await runCronWork();
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  // Async path: respond immediately so cron-job.org does not hit client timeout
  // while research + LLM may take 30–60s on Vercel.
  const work = runCronWork().then((result) => {
    if (!result.ok) {
      console.error("[cron/slot] background failed:", result.error);
    } else {
      console.log(
        "[cron/slot] background ok: created=",
        result.created,
        "users=",
        result.users,
      );
    }
  });

  try {
    waitUntil(work);
  } catch {
    // Local Next.js may not support waitUntil — still fire work without awaiting long
    void work;
  }

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      message:
        "Cron accepted. Work continues in the background (cleanup + slot generation). Check Vercel logs and /posts for new packs.",
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
