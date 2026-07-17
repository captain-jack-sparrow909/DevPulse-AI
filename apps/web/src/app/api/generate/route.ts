import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { runDueSlotGeneration } from "@/lib/ai/pipeline";
import { runPhasesWithBudget } from "@/lib/ai/phased-pipeline";
import { skipSlot } from "@/lib/schedule/slot-actions";
import { prisma } from "@/lib/db";
import {
  completeOperationalRun,
  failOperationalRun,
  recordOperationalEvent,
  startOperationalRun,
} from "@/lib/operations/store";

/** Local can be higher; Vercel Hobby still caps near 60s — we chain phases. */
export const maxDuration = 300;

async function observedManualGeneration<T extends {
  jobId?: string | null;
  postsCreated?: number;
  sourcesFound?: number;
}>(userId: string, stage: string, task: () => Promise<T>): Promise<T & { operationRunId: string }> {
  const operation = await startOperationalRun({ userId, kind: "generation", source: "manual", stage });
  const started = Date.now();
  try {
    const result = await task();
    await recordOperationalEvent(operation.id, {
      stage: "completed",
      message: `${result.postsCreated ?? 0} post pack(s) created by manual generation.`,
      durationMs: Date.now() - started,
      metadata: { jobId: result.jobId, sourcesFound: result.sourcesFound },
    });
    if (result.jobId) {
      await prisma.operationalRun.update({
        where: { id: operation.id },
        data: { subjectType: "generation_job", subjectId: result.jobId },
      });
    }
    await completeOperationalRun(operation.id, { stage: "completed", message: "Manual generation completed." });
    return { ...result, operationRunId: operation.id };
  } catch (error) {
    await failOperationalRun(operation.id, error, stage);
    throw error;
  }
}

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
      const result = await observedManualGeneration(session.user.id, "regenerate", () =>
        runDueSlotGeneration({
          userId: session.user.id,
          platforms,
          slotIndex,
          allowEarly: true,
          regenerate: true,
          researchMode: "fast",
          skipScreenshot: true,
        }),
      );
      return NextResponse.json({ ...result, action: "regenerate" });
    }

    // Manual override can intentionally prepare the next unfilled slot before
    // its normal prep window. The resumable cron path remains time-driven.
    if (allowEarly) {
      const result = await observedManualGeneration(session.user.id, "early_generation", () =>
        runDueSlotGeneration({
          userId: session.user.id,
          platforms,
          allowEarly: true,
          researchMode: "fast",
          skipScreenshot: true,
        }),
      );
      return NextResponse.json({ ...result, action: "generate" });
    }

    // Multi-phase under a time budget (same as cron; no self-fetch)
    const r = await runPhasesWithBudget(session.user.id, 55_000, { source: "manual" });
    return NextResponse.json({
      postsCreated: r.postsCreated,
      jobId: r.jobId,
      researchRunId: r.researchRunId,
      logs: r.logs,
      slotIndex: r.slotIndex,
      phase: r.phase,
      sourcesFound: r.sourcesFound,
      skipped: r.postsCreated === 0,
      skipReason:
        r.skipReason ||
        (r.postsCreated === 0 && r.continueChain
          ? "Phases in progress — wait for cron or click again to continue"
          : r.skipReason),
      action: "generate",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
