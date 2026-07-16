import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id, itemId } = await params;
  const item = await prisma.campaignItem.findFirst({
    where: { id: itemId, campaignId: id, campaign: { userId: session.user.id } },
  });
  if (!item) return NextResponse.json({ error: "Campaign item not found" }, { status: 404 });
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");
  if (action === "skip") {
    if (item.postId) return NextResponse.json({ error: "Drafted stages cannot be skipped" }, { status: 409 });
    await prisma.campaignItem.update({ where: { id: item.id }, data: { status: "skipped" } });
    return NextResponse.json({ ok: true });
  }
  if (action === "reschedule") {
    const scheduledFor = new Date(String(body.scheduledFor ?? ""));
    if (Number.isNaN(scheduledFor.getTime())) {
      return NextResponse.json({ error: "Invalid schedule date" }, { status: 400 });
    }
    await prisma.campaignItem.update({ where: { id: item.id }, data: { scheduledFor } });
    return NextResponse.json({ ok: true });
  }
  if (action !== "move_up" && action !== "move_down") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }
  const targetSequence = item.sequence + (action === "move_up" ? -1 : 1);
  const sibling = await prisma.campaignItem.findUnique({
    where: { campaignId_sequence: { campaignId: id, sequence: targetSequence } },
  });
  if (!sibling) return NextResponse.json({ error: "Stage cannot move further" }, { status: 409 });
  await prisma.$transaction([
    prisma.campaignItem.update({ where: { id: item.id }, data: { sequence: -1 } }),
    prisma.campaignItem.update({
      where: { id: sibling.id },
      data: { sequence: item.sequence, scheduledFor: item.scheduledFor },
    }),
    prisma.campaignItem.update({
      where: { id: item.id },
      data: { sequence: targetSequence, scheduledFor: sibling.scheduledFor },
    }),
  ]);
  return NextResponse.json({ ok: true });
}
