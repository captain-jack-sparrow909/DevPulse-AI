import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { workflowUpdate, type WorkflowAction } from "@/lib/distribution/service";

const ACTIONS = new Set<WorkflowAction>([
  "asset_ready",
  "pre_engaged",
  "published",
  "comments_reviewed",
  "metrics_captured",
  "complete",
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.distributionWorkflow.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "") as WorkflowAction;
  if (!ACTIONS.has(action)) return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  const workflow = await prisma.distributionWorkflow.update({
    where: { id },
    data: {
      ...workflowUpdate(action),
      notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 1_000) || null : undefined,
    },
  });
  return NextResponse.json({ workflow });
}
