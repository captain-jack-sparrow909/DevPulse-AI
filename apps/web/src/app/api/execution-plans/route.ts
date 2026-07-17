import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createWeeklyExecutionPlan } from "@/lib/execution-plan/service";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let reviewId: string | undefined;
  try {
    const body = (await request.json()) as { reviewId?: unknown };
    if (typeof body.reviewId === "string") reviewId = body.reviewId;
  } catch {
    // Empty body selects the latest review.
  }
  try {
    const plan = await createWeeklyExecutionPlan(session.user.id, reviewId);
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create execution plan" }, { status: 409 });
  }
}
