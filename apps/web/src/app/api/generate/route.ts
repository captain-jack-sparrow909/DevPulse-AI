import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { runDueSlotGeneration } from "@/lib/ai/pipeline";
import { skipSlot } from "@/lib/schedule/slot-actions";

export const maxDuration = 300;

/**
 * Slot actions:
 * - default: generate next due slot (1 post)
 * - regenerate + slotIndex: wipe that slot's post and write a fresh one
 * - skip + slotIndex: mark slot skipped for today (cron will not fill it)
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

    const result = await runDueSlotGeneration({
      userId: session.user.id,
      platforms,
      slotIndex,
      allowEarly: allowEarly || regenerate,
      regenerate,
    });
    return NextResponse.json({ ...result, action: regenerate ? "regenerate" : "generate" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
