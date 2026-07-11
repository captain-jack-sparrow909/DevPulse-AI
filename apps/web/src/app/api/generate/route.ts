import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { runDueSlotGeneration } from "@/lib/ai/pipeline";

export const maxDuration = 300;

/**
 * Generate exactly ONE post for the next due slot (fresh research each time).
 * Does not batch all 12 posts — later slots pick up midday trends.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let platforms: Array<"x" | "linkedin"> = ["x", "linkedin"];
  let slotIndex: number | undefined;
  let allowEarly = false;

  try {
    const body = (await request.json()) as {
      platforms?: Array<"x" | "linkedin">;
      slotIndex?: number;
      allowEarly?: boolean;
      /** @deprecated batching disabled — ignored */
      targetCount?: number;
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
  } catch {
    // empty body is fine
  }

  try {
    const result = await runDueSlotGeneration({
      userId: session.user.id,
      platforms,
      slotIndex,
      allowEarly,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
