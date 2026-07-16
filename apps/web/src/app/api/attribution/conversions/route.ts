import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

const EVENT_TYPES = new Set([
  "github_star",
  "beta_signup",
  "waitlist_signup",
  "follower",
  "repository_visit",
  "conversion",
]);

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as Record<string, unknown>;
  const eventType = String(body.eventType ?? "");
  const value = Number(body.value ?? 1);
  if (!EVENT_TYPES.has(eventType) || !Number.isFinite(value) || value < 0) {
    return NextResponse.json({ error: "Supported event type and non-negative value are required" }, { status: 400 });
  }
  const trackedLinkId = typeof body.trackedLinkId === "string" && body.trackedLinkId
    ? body.trackedLinkId
    : null;
  const link = trackedLinkId
    ? await prisma.trackedLink.findFirst({ where: { id: trackedLinkId, userId: session.user.id } })
    : null;
  if (trackedLinkId && !link) return NextResponse.json({ error: "Tracked link not found" }, { status: 404 });
  const postId = link?.postId || (typeof body.postId === "string" ? body.postId : null);
  if (postId && !link) {
    const post = await prisma.post.findFirst({ where: { id: postId, userId: session.user.id }, select: { id: true } });
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }
  const requestedCampaignId = typeof body.campaignId === "string" && body.campaignId
    ? body.campaignId
    : null;
  if (requestedCampaignId && !link) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: requestedCampaignId, userId: session.user.id },
      select: { id: true },
    });
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  const occurredAt = body.occurredAt ? new Date(String(body.occurredAt)) : new Date();
  if (Number.isNaN(occurredAt.getTime())) {
    return NextResponse.json({ error: "Invalid conversion date" }, { status: 400 });
  }
  const event = await prisma.conversionEvent.create({
    data: {
      userId: session.user.id,
      eventType,
      value: Math.round(value),
      source: "manual",
      platform: link?.platform || (body.platform === "x" || body.platform === "linkedin" ? body.platform : null),
      trackedLinkId: link?.id,
      postId,
      campaignId: link?.campaignId || requestedCampaignId,
      campaignItemId: link?.campaignItemId,
      experimentVariantId: link?.experimentVariantId,
      notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || null : null,
      occurredAt,
    },
  });
  return NextResponse.json({ event }, { status: 201 });
}
