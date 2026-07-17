import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateWeeklyExecutionPlan } from "@/lib/execution-plan/service";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { action?: string };
  if (body.action !== "approve" && body.action !== "cancel" && body.action !== "complete") {
    return NextResponse.json({ error: "Unsupported plan action" }, { status: 400 });
  }
  const { id } = await params;
  try {
    const plan = await updateWeeklyExecutionPlan(session.user.id, id, body.action);
    return NextResponse.json({ plan });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update execution plan" }, { status: 409 });
  }
}
