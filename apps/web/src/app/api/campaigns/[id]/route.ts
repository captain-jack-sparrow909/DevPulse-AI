import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { refreshCampaignEvidence } from "@/lib/campaigns/service";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const campaign = await prisma.campaign.findFirst({ where: { id, userId: session.user.id } });
  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");
  if (action === "refresh_evidence") {
    await refreshCampaignEvidence(session.user.id, id);
    return NextResponse.json({ ok: true });
  }
  const status = action === "activate"
    ? "active"
    : action === "pause"
      ? "paused"
      : action === "complete"
        ? "completed"
        : null;
  if (!status) return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  const updated = await prisma.campaign.update({ where: { id }, data: { status } });
  return NextResponse.json({ campaign: updated });
}
