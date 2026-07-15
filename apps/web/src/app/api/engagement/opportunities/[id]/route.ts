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
  const existing = await prisma.engagementOpportunity.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await request.json()) as Record<string, unknown>;
  const status = ["new", "replied", "dismissed"].includes(String(body.status))
    ? String(body.status)
    : existing.status;
  const opportunity = await prisma.engagementOpportunity.update({
    where: { id },
    data: {
      status,
      suggestedReply:
        typeof body.suggestedReply === "string"
          ? body.suggestedReply.trim().slice(0, 1500) || null
          : undefined,
    },
  });
  return NextResponse.json({ opportunity });
}

