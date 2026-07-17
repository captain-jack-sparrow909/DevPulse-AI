import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateExecutionPlanItem } from "@/lib/execution-plan/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as { action?: string };
  const allowed = ["reject", "restore", "skip", "published", "measured"] as const;
  if (!allowed.includes(body.action as typeof allowed[number])) {
    return NextResponse.json({ error: "Unsupported item action" }, { status: 400 });
  }
  const { id, itemId } = await params;
  try {
    const item = await updateExecutionPlanItem(session.user.id, id, itemId, body.action as typeof allowed[number]);
    return NextResponse.json({ item });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update execution item" }, { status: 409 });
  }
}
