import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runCronForAllUsers } from "@/lib/ai/pipeline";
import { promoteDuePosts } from "@/lib/schedule/promote-ready";
import { runRetentionCleanup } from "@/lib/maintenance/cleanup";

/** Hobby max is 60s. Worker invocation uses this full budget for research+LLM. */
export const maxDuration = 60;

/**
 * External cron target (cron-job.org / GitHub Actions / local loop).
 *
 * Why two phases?
 * - cron-job.org free max request timeout = 30s
 * - research + DeepSeek often needs 30–60s
 * - Returning 202 and running work only via waitUntil in the *same* invocation
 *   was unreliable (empty due slots until the user hit Regenerate).
 *
 * Flow:
 * 1) Dispatcher (default): auth → kick a *detached* worker request → 202 in <1s
 * 2) Worker (?worker=1): runs generation to completion (up to maxDuration)
 *
 * Every 15 min tick retries any empty slot that is due or in its prep window
 * (~50 min before due), so a failed run is retried automatically — no UI click.
 *
 * Debug sync: ?wait=1 or CRON_SYNC=1 (not for cron-job.org).
 *
 * Auth: Authorization: Bearer <CRON_SECRET>  or  ?secret=<CRON_SECRET>
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
    // Generation first — 60s budget is tight; cleanup is secondary.
    const result = await runCronForAllUsers();
    await promoteDuePosts();
    const cleanup = await runRetentionCleanup();
    return {
      ok: true,
      message:
        "Cron finished: prep/retry slot generation + promote + cleanup. Empty due slots are retried every tick.",
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

function buildWorkerUrl(request: Request): string {
  const url = new URL(request.url);
  url.searchParams.set("worker", "1");
  url.searchParams.delete("wait");
  // Ensure auth still works if the outer call used ?secret=
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && !url.searchParams.get("secret")) {
    // Prefer header on fetch; secret query is a fallback for some hosts
  }
  return url.toString();
}

async function dispatchWorker(request: Request): Promise<void> {
  const workerUrl = buildWorkerUrl(request);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-devpulse-cron-worker": "1",
  };
  const auth = request.headers.get("authorization");
  if (auth) headers.Authorization = auth;

  const secret = process.env.CRON_SECRET?.trim();
  const urlWithSecret = new URL(workerUrl);
  if (secret && !urlWithSecret.searchParams.get("secret") && !auth) {
    urlWithSecret.searchParams.set("secret", secret);
  }

  console.log("[cron/slot] dispatching detached worker…");
  try {
    const res = await fetch(urlWithSecret.toString(), {
      method: "GET",
      headers,
      cache: "no-store",
    });
    const text = await res.text();
    console.log(
      `[cron/slot] worker finished status=${res.status} body=${text.slice(0, 600)}`,
    );
  } catch (err) {
    // If self-fetch fails (rare), run work inline in this waitUntil budget
    console.error(
      "[cron/slot] worker fetch failed, falling back to inline run:",
      err instanceof Error ? err.message : err,
    );
    const result = await runCronWork();
    console.log(
      `[cron/slot] inline fallback: ok=${result.ok} created=${result.created} error=${result.error ?? ""}`,
    );
  }
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const isWorker = url.searchParams.get("worker") === "1";
  const waitForResult =
    url.searchParams.get("wait") === "1" || process.env.CRON_SYNC === "1";

  // Worker or explicit sync: run generation to completion in this invocation
  if (isWorker || waitForResult) {
    const result = await runCronWork();
    console.log(
      `[cron/slot] ${isWorker ? "worker" : "sync"} done: created=${result.created} users=${result.users} ok=${result.ok}`,
    );
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  // Dispatcher: return 202 immediately (safe for 30s scheduler caps),
  // then start a detached worker with its own maxDuration budget.
  const dispatch = dispatchWorker(request);
  try {
    waitUntil(dispatch);
  } catch {
    // Local Next.js may not support waitUntil
    void dispatch;
  }

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      message:
        "Cron accepted. Detached worker will prep/retry the next slot (research + write). Empty due slots retry every 15 min until filled — no Regenerate click required.",
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
