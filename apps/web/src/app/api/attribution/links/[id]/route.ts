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
  const existing = await prisma.trackedLink.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Tracked link not found" }, { status: 404 });
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const status = action === "pause" ? "paused" : action === "activate" ? "active" : null;
  if (!status) return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  const link = await prisma.trackedLink.update({ where: { id }, data: { status } });
  return NextResponse.json({ link });
}
