import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runCronForAllUsers } from "@/lib/ai/pipeline";
import { promoteDuePosts } from "@/lib/schedule/promote-ready";
import { runRetentionCleanup } from "@/lib/maintenance/cleanup";

/** Hobby max is 60s; Pro can raise this. Background work uses this budget. */
export const maxDuration = 60;

/**
 * External cron target (cron-job.org / GitHub Actions / local loop).
 *
 * Default: HTTP 202 in milliseconds + continue generation via waitUntil().
 * Required because free schedulers (cron-job.org) often cap request timeout at
 * 30s, while research+LLM regularly needs 30–60s. The client disconnect must
 * NOT cancel the work — waitUntil keeps the serverless invocation alive up to
 * maxDuration after the response is sent.
 *
 * Order (60s budget):
 * 1) generate current due slot (research + write) — highest priority
 * 2) promote due approved posts
 * 3) retention cleanup + DB keep-alive
 *
 * Opt into full sync (local debug only): ?wait=1 or CRON_SYNC=1
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
  results?: Array<{ userId: string; postsCreated: number; skipReason?: string }>;
  error?: string;
}> {
  try {
    // Generation first so the current wall-clock slot is filled before cleanup
    // burns remaining serverless time.
    const result = await runCronForAllUsers();
    await promoteDuePosts();
    const cleanup = await runRetentionCleanup();
    return {
      ok: true,
      message:
        "Cron finished: current due-slot generation + promote + cleanup. Missed older slots are auto-skipped.",
      cleanup: {
        postsDeleted: cleanup.postsDeleted,
        sourcesDeleted: cleanup.sourcesDeleted,
        researchRunsDeleted: cleanup.researchRunsDeleted,
        generationJobsDeleted: cleanup.generationJobsDeleted,
        screenshotsDeleted: cleanup.screenshotsDeleted,
      },
      created: result.created,
      users: result.users,
      results: result.results,
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
  // Sync only for local debugging — production + cron-job.org (30s max) must use async.
  const waitForResult =
    url.searchParams.get("wait") === "1" || process.env.CRON_SYNC === "1";

  if (waitForResult) {
    const result = await runCronWork();
    console.log(
      "[cron/slot] sync done: created=",
      result.created,
      "users=",
      result.users,
      "ok=",
      result.ok,
    );
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  // Start work immediately, register with waitUntil, then return 202.
  // cron-job.org's 30s timeout only applies to waiting for the HTTP response;
  // once we respond, Vercel keeps this invocation for up to maxDuration.
  const work = runCronWork()
    .then((result) => {
      if (!result.ok) {
        console.error("[cron/slot] background failed:", result.error);
      } else {
        console.log(
          "[cron/slot] background ok: created=",
          result.created,
          "users=",
          result.users,
          "results=",
          JSON.stringify(result.results ?? []),
        );
      }
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
    // Local Next.js / non-Vercel: fire-and-forget so the response still returns fast
    void work;
  }

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      message:
        "Cron accepted in <1s (safe for 30s scheduler timeouts). Slot generation continues on Vercel up to ~60s. Check Vercel logs for `background ok` and /posts for new packs.",
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
