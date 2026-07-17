import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

function count(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(2_000_000_000, Math.round(parsed))) : null;
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as Record<string, unknown>;
  const platform = body.platform === "linkedin" ? "linkedin" : body.platform === "x" ? "x" : null;
  const followers = count(body.followers);
  if (!platform || followers == null) {
    return NextResponse.json({ error: "Platform and follower count are required" }, { status: 400 });
  }
  const capturedAt = body.capturedAt ? new Date(String(body.capturedAt)) : new Date();
  if (Number.isNaN(capturedAt.getTime())) return NextResponse.json({ error: "Invalid capture time" }, { status: 400 });
  const checkpoint = await prisma.followerCheckpoint.create({
    data: {
      userId: session.user.id,
      platform,
      followers,
      profileViews: count(body.profileViews),
      notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || null : null,
      capturedAt,
    },
  });
  return NextResponse.json({ checkpoint }, { status: 201 });
}
