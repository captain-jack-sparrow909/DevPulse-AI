import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { decideWeeklyGrowthDecision } from "@/lib/growth-review/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; decisionId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { action?: string };
  if (body.action !== "apply" && body.action !== "reject") {
    return NextResponse.json({ error: "Action must be apply or reject" }, { status: 400 });
  }
  const { id, decisionId } = await params;
  try {
    const review = await decideWeeklyGrowthDecision(session.user.id, id, decisionId, body.action);
    return NextResponse.json({ review });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not decide weekly action" },
      { status: 409 },
    );
  }
}
