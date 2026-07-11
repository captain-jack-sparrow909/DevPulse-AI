import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { runDueSlotGeneration } from "@/lib/ai/pipeline";
import { runOneGenerationPhase } from "@/lib/ai/phased-pipeline";
import { skipSlot } from "@/lib/schedule/slot-actions";

/** Local can be higher; Vercel Hobby still caps near 60s — we chain phases. */
export const maxDuration = 300;

/**
 * Slot actions:
 * - default: multi-phase generate (research chunks → write), looping in-request when possible
 * - regenerate + slotIndex: wipe slot + full pipeline for that slot
 * - skip + slotIndex: mark skipped
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let platforms: Array<"x" | "linkedin"> = ["x", "linkedin"];
  let slotIndex: number | undefined;
  let allowEarly = false;
  let regenerate = false;
  let action: "generate" | "skip" | "regenerate" = "generate";
  let reason: string | undefined;

  try {
    const body = (await request.json()) as {
      platforms?: Array<"x" | "linkedin">;
      slotIndex?: number;
      allowEarly?: boolean;
      regenerate?: boolean;
      action?: "generate" | "skip" | "regenerate";
      reason?: string;
    };
    if (body.platforms?.length) {
      platforms = body.platforms;
    }
    if (typeof body.slotIndex === "number") {
      slotIndex = body.slotIndex;
    }
    if (body.allowEarly) {
      allowEarly = true;
    }
    if (body.regenerate || body.action === "regenerate") {
      regenerate = true;
      action = "regenerate";
    }
    if (body.action === "skip") {
      action = "skip";
    }
    if (body.reason) {
      reason = body.reason;
    }
  } catch {
    // empty body is fine
  }

  try {
    if (action === "skip") {
      if (slotIndex === undefined) {
        return NextResponse.json({ error: "slotIndex is required to skip" }, { status: 400 });
      }
      const result = await skipSlot(session.user.id, slotIndex, reason);
      return NextResponse.json({
        ok: true,
        action: "skip",
        ...result,
        message: `Slot ${slotIndex + 1} skipped for today. Cron will not generate it. Use Regenerate if you change your mind.`,
      });
    }

    // Targeted regenerate: clear + one-shot pipeline for that slot (manual override)
    if (regenerate && slotIndex !== undefined) {
      const result = await runDueSlotGeneration({
        userId: session.user.id,
        platforms,
        slotIndex,
        allowEarly: true,
        regenerate: true,
        researchMode: "fast",
        skipScreenshot: true,
      });
      return NextResponse.json({ ...result, action: "regenerate" });
    }

    // Multi-phase: run research chunks then write (up to 6 phases in this request)
    const allLogs: string[] = [];
    let postsCreated = 0;
    let lastPhase = "";
    let jobId: string | null = null;
    let researchRunId: string | null = null;
    let resultSlot: number | undefined;
    let skipReason: string | undefined;

    for (let i = 0; i < 6; i++) {
      const r = await runOneGenerationPhase(session.user.id);
      allLogs.push(...r.logs);
      postsCreated += r.postsCreated;
      jobId = r.jobId ?? jobId;
      researchRunId = r.researchRunId ?? researchRunId;
      if (r.slotIndex !== undefined) resultSlot = r.slotIndex;
      lastPhase = r.phase ?? lastPhase;
      if (r.postsCreated > 0) {
        return NextResponse.json({
          postsCreated,
          jobId,
          researchRunId,
          logs: allLogs,
          slotIndex: resultSlot,
          phase: lastPhase,
          action: "generate",
          sourcesFound: r.sourcesFound,
        });
      }
      if (!r.continueChain) {
        skipReason = r.skipReason;
        break;
      }
    }

    return NextResponse.json({
      postsCreated,
      jobId,
      researchRunId,
      logs: allLogs,
      slotIndex: resultSlot,
      phase: lastPhase,
      skipped: postsCreated === 0,
      skipReason:
        skipReason ||
        (postsCreated === 0
          ? "Phases started but post not finished in this request — cron will continue the chain"
          : undefined),
      action: "generate",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
