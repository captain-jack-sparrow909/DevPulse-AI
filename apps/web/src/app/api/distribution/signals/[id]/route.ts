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
  const existing = await prisma.contentSignal.findFirst({ where: { id, userId: session.user.id } });
  if (!existing) return NextResponse.json({ error: "Signal not found" }, { status: 404 });
  const body = (await request.json()) as Record<string, unknown>;
  const status = ["saved", "used", "dismissed"].includes(String(body.status))
    ? String(body.status)
    : null;
  if (!status) return NextResponse.json({ error: "Unsupported status" }, { status: 400 });
  const signal = await prisma.contentSignal.update({
    where: { id },
    data: { status, usedAt: status === "used" ? new Date() : undefined },
  });
  return NextResponse.json({ signal });
}
