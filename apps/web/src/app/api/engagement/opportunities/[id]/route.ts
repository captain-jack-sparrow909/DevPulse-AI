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
      outcome:
        typeof body.outcome === "string" ? body.outcome.trim().slice(0, 500) || null : undefined,
      repliedAt: status === "replied" ? existing.repliedAt ?? new Date() : undefined,
    },
  });
  if (status === "replied" && existing.status !== "replied" && existing.author) {
    const handle = existing.author.trim().toLowerCase().replace(/^@/, "").slice(0, 120);
    if (handle) {
      const relationship = await prisma.creatorRelationship.upsert({
        where: {
          userId_platform_handle: {
            userId: session.user.id,
            platform: existing.platform,
            handle,
          },
        },
        create: {
          userId: session.user.id,
          platform: existing.platform,
          handle,
          displayName: existing.author,
          interactionCount: 1,
          replyCount: 1,
          lastInteractionAt: new Date(),
          topicsJson: JSON.stringify(existing.topic ? [existing.topic] : []),
        },
        update: {
          interactionCount: { increment: 1 },
          replyCount: { increment: 1 },
          lastInteractionAt: new Date(),
        },
      });
      await prisma.engagementOpportunity.update({
        where: { id },
        data: { relationshipId: relationship.id },
      });
    }
  }
  return NextResponse.json({ opportunity });
}
