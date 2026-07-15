import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

function metric(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(2_000_000_000, Math.max(0, Math.round(parsed)));
}

function optionalMetric(value: unknown): number | null {
  if (value === "" || value == null) return null;
  return metric(value);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const post = await prisma.post.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const snapshots = await prisma.socialPerformanceSnapshot.findMany({
    where: { postId: id, userId: user.id },
    orderBy: { capturedAt: "desc" },
  });
  return NextResponse.json({ snapshots });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const post = await prisma.post.findFirst({
    where: { id, userId: user.id },
    select: { id: true },
  });
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json()) as Record<string, unknown>;
  const platform = body.platform === "linkedin" ? "linkedin" : body.platform === "x" ? "x" : null;
  if (!platform) {
    return NextResponse.json({ error: "Platform must be x or linkedin" }, { status: 400 });
  }
  const capturedAt = body.capturedAt ? new Date(String(body.capturedAt)) : new Date();
  if (Number.isNaN(capturedAt.getTime())) {
    return NextResponse.json({ error: "Invalid capture time" }, { status: 400 });
  }

  const snapshot = await prisma.socialPerformanceSnapshot.create({
    data: {
      userId: user.id,
      postId: id,
      platform,
      impressions: metric(body.impressions),
      likes: metric(body.likes),
      replies: metric(body.replies),
      reposts: metric(body.reposts),
      saves: metric(body.saves),
      profileVisits: metric(body.profileVisits),
      linkClicks: metric(body.linkClicks),
      followersBefore: optionalMetric(body.followersBefore),
      followersAfter: optionalMetric(body.followersAfter),
      notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) || null : null,
      capturedAt,
    },
  });
  return NextResponse.json({ snapshot }, { status: 201 });
}

