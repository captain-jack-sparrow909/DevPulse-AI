import { NextResponse } from "next/server";
import { runCronForAllUsers } from "@/lib/ai/pipeline";
import { promoteDuePosts } from "@/lib/schedule/promote-ready";

export const maxDuration = 300;

/**
 * Cron: generate at most one post per user for the earliest due unfilled slot.
 *
 * Secure with CRON_SECRET:
 *   Authorization: Bearer <CRON_SECRET>
 *   or ?secret=<CRON_SECRET>
 *
 * Suggested: every 15 minutes via Vercel cron (vercel.json) or system crontab.
 */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  // In local dev without secret, allow (solo app). Production should set CRON_SECRET.
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization") || "";
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === secret) return true;
  // Vercel Cron sends this header when configured
  if (request.headers.get("x-vercel-cron") === "1") return true;
  return false;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await promoteDuePosts();
    const result = await runCronForAllUsers();
    return NextResponse.json({
      ok: true,
      message:
        "Slot cron finished. At most one fresh post per user for the next due slot.",
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
