import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const campaign = await prisma.campaign.findFirst({ where: { id, userId: session.user.id } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const body = (await request.json()) as Record<string, unknown>;
  const value = Number(body.value);
  if (!Number.isFinite(value) || value < 0) {
    return NextResponse.json({ error: "Metric value must be a non-negative number" }, { status: 400 });
  }
  const metric = typeof body.metric === "string" && body.metric.trim()
    ? body.metric.trim().slice(0, 80)
    : campaign.goalMetric;
  const snapshot = await prisma.campaignMetricSnapshot.create({
    data: {
      userId: session.user.id,
      campaignId: id,
      metric,
      value: Math.round(value),
      notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 500) || null : null,
    },
  });
  return NextResponse.json({ snapshot }, { status: 201 });
}
