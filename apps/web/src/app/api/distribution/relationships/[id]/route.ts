import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const existing = await prisma.creatorRelationship.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Relationship not found" }, { status: 404 });
  const body = (await request.json()) as Record<string, unknown>;
  const status = ["active", "watch", "muted"].includes(String(body.status))
    ? String(body.status)
    : undefined;
  const requestedPriority = Number(body.priorityScore);
  const relationship = await prisma.creatorRelationship.update({
    where: { id },
    data: {
      status,
      priorityScore: Number.isFinite(requestedPriority)
        ? Math.max(0, Math.min(100, Math.round(requestedPriority)))
        : undefined,
      notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 1_000) || null : undefined,
    },
  });
  return NextResponse.json({ relationship });
}
