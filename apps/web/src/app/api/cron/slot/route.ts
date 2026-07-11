import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { runCronPhaseForAllUsers } from "@/lib/ai/phased-pipeline";
import { promoteDuePosts } from "@/lib/schedule/promote-ready";
import { runRetentionCleanup } from "@/lib/maintenance/cleanup";

/** Hobby max 60s — each worker runs ONE phase only, then may schedule the next worker. */
export const maxDuration = 60;

const MAX_CHAIN_DEPTH = 8; // 4 research chunks + write + margin

/**
 * Multi-phase cron (Vercel Hobby 60s safe):
 *
 * External scheduler hits dispatcher → 202 in <1s.
 * Each worker:
 *   1) runs ONE research chunk OR the write phase (~15–35s)
 *   2) if more work remains, schedules the *next* worker via waitUntil(fetch)
 *   3) returns 200 so this invocation ends well under 60s
 *
 * Chunks: community → code/papers → blogs → discovery → write
 * Sources accumulate in DB between chunks; write uses the full set.
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

async function runOnePhaseWork(): Promise<{
  ok: boolean;
  message: string;
  created?: number;
  users?: number;
  continueChain?: boolean;
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
    if (result.created === 0 && !result.continueChain) {
      cleanup = await runRetentionCleanup();
    }

    return {
      ok: true,
      message: result.continueChain
        ? "Phase done; next worker will continue research or write."
        : "Phase done; chain complete for this slot (or nothing due).",
      created: result.created,
      users: result.users,
      continueChain: result.continueChain,
      results: result.results,
      cleanup: cleanup
        ? {
            postsDeleted: cleanup.postsDeleted,
            sourcesDeleted: cleanup.sourcesDeleted,
            researchRunsDeleted: cleanup.researchRunsDeleted,
            generationJobsDeleted: cleanup.generationJobsDeleted,
            screenshotsDeleted: cleanup.screenshotsDeleted,
          }
        : undefined,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cron phase failed";
    console.error("[cron/slot]", message);
    return { ok: false, message: "Cron phase failed", error: message };
  }
}

function buildWorkerUrl(request: Request, depth: number): URL {
  const url = new URL(request.url);
  url.searchParams.set("worker", "1");
  url.searchParams.set("depth", String(depth));
  url.searchParams.delete("wait");
  const secret = process.env.CRON_SECRET?.trim();
  const auth = request.headers.get("authorization");
  if (secret && !url.searchParams.get("secret") && !auth) {
    url.searchParams.set("secret", secret);
  }
  return url;
}

/** Fire-and-forget next worker (separate 60s budget). Do not await completion of the whole chain. */
function scheduleNextWorker(request: Request, depth: number): void {
  if (depth > MAX_CHAIN_DEPTH) {
    console.warn(`[cron/slot] chain depth ${depth} exceeded max ${MAX_CHAIN_DEPTH}`);
    return;
  }

  const url = buildWorkerUrl(request, depth);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-devpulse-cron-worker": "1",
  };
  const auth = request.headers.get("authorization");
  if (auth) headers.Authorization = auth;

  const work = fetch(url.toString(), {
    method: "GET",
    headers,
    cache: "no-store",
  })
    .then(async (res) => {
      const text = await res.text();
      console.log(
        `[cron/slot] chained worker depth=${depth} status=${res.status} ${text.slice(0, 300)}`,
      );
    })
    .catch((err) => {
      console.error(
        `[cron/slot] chain fetch depth=${depth} failed:`,
        err instanceof Error ? err.message : err,
      );
    });

  try {
    waitUntil(work);
  } catch {
    void work;
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
  const depth = Number(url.searchParams.get("depth") || "0") || 0;

  // Worker / sync: one phase only, then schedule next worker if needed
  if (isWorker || waitForResult) {
    const result = await runOnePhaseWork();
    console.log(
      `[cron/slot] phase depth=${depth} created=${result.created} chain=${result.continueChain} ok=${result.ok}`,
    );

    if (result.ok && result.continueChain) {
      // Next phase gets its own invocation + 60s budget
      scheduleNextWorker(request, depth + 1);
    }

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  // Dispatcher: 202 immediately, kick first worker only
  scheduleNextWorker(request, 0);

  return NextResponse.json(
    {
      ok: true,
      accepted: true,
      message:
        "Cron accepted. Workers will run research in 4 chunks, then write (self-chained). Each step stays under 60s.",
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
