import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { waitUntil } from "@vercel/functions";
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
  slotIndex?: number;
}>(operation: { id: string; startedAt: Date }, task: () => Promise<T>): Promise<T & { operationRunId: string }> {
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
    await completeOperationalRun(operation.id, {
      stage: "completed",
      message: "Manual generation completed.",
      metadata: {
        jobId: result.jobId,
        postsCreated: result.postsCreated,
        sourcesFound: result.sourcesFound,
        slotIndex: result.slotIndex,
      },
    });
    return { ...result, operationRunId: operation.id };
  } catch (error) {
    await failOperationalRun(operation.id, error, "generation");
    throw error;
  }
}

function dispatch(work: Promise<unknown>) {
  const guarded = work.catch((error) => {
    console.error("[manual-generation]", error instanceof Error ? error.message : error);
  });
  try {
    waitUntil(guarded);
  } catch {
    void guarded;
  }
}

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const operationRunId = new URL(request.url).searchParams.get("operationRunId");
  if (!operationRunId) return NextResponse.json({ error: "operationRunId is required" }, { status: 400 });

  const operation = await prisma.operationalRun.findFirst({
    where: { id: operationRunId, userId: session.user.id, kind: "generation", source: "manual" },
    include: { events: { orderBy: { occurredAt: "asc" }, take: 50 } },
  });
  if (!operation) return NextResponse.json({ error: "Generation request not found" }, { status: 404 });
  const job = operation.subjectId
    ? await prisma.generationJob.findFirst({ where: { id: operation.subjectId, userId: session.user.id } })
    : await prisma.generationJob.findFirst({
        where: { userId: session.user.id, createdAt: { gte: operation.startedAt } },
        orderBy: { createdAt: "desc" },
      });
  let jobLogs: string[] = [];
  try {
    const parsed = JSON.parse(job?.logsJson || "[]") as unknown;
    if (Array.isArray(parsed)) jobLogs = parsed.map(String);
  } catch {
    // Operational events still provide durable progress.
  }
  const logs = [...operation.events.map((event) => `[${event.occurredAt.toISOString()}] ${event.message}`), ...jobLogs]
    .filter((value, index, all) => all.indexOf(value) === index)
    .slice(-100);

  return NextResponse.json({
    operationRunId: operation.id,
    status: operation.status,
    phase: job?.status || operation.stage,
    message: operation.message,
    error: operation.errorMessage,
    jobId: job?.id ?? null,
    postsCreated: job?.producedCount ?? 0,
    logs,
  });
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

    if (regenerate && slotIndex === undefined) {
      return NextResponse.json({ error: "slotIndex is required to regenerate" }, { status: 400 });
    }

    const stage = regenerate ? "regenerate" : allowEarly ? "early_generation" : "generation";
    const operation = await startOperationalRun({
      userId: session.user.id,
      kind: "generation",
      source: "manual",
      stage,
      metadata: { action, slotIndex, allowEarly },
    });

    const work = regenerate
      ? observedManualGeneration(operation, () =>
          runDueSlotGeneration({
            userId: session.user.id,
            platforms,
            slotIndex,
            allowEarly: true,
            regenerate: true,
            researchMode: "fast",
            skipScreenshot: true,
          }),
        )
      : allowEarly
        ? observedManualGeneration(operation, () =>
            runDueSlotGeneration({
              userId: session.user.id,
              platforms,
              allowEarly: true,
              researchMode: "fast",
              skipScreenshot: true,
            }),
          )
        : runPhasesWithBudget(session.user.id, 55_000, { source: "manual", operation });
    dispatch(work);
    return NextResponse.json(
      {
        accepted: true,
        operationRunId: operation.id,
        action,
        message: "Generation started in the background. Progress is available immediately.",
      },
      { status: 202 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
