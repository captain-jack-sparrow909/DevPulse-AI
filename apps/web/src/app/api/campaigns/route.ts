import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { createCampaign } from "@/lib/campaigns/service";
import { isCampaignGoal } from "@/lib/campaigns/definitions";

function optionalNumber(value: unknown) {
  if (value === "" || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
}

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  if (!name || !projectId || !isCampaignGoal(body.goal)) {
    return NextResponse.json({ error: "Name, project, and a supported goal are required" }, { status: 400 });
  }
  const startAt = new Date(String(body.startAt ?? ""));
  const endAt = new Date(String(body.endAt ?? ""));
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return NextResponse.json({ error: "Valid campaign dates are required" }, { status: 400 });
  }
  const platforms = body.platforms === "x" || body.platforms === "linkedin"
    ? body.platforms
    : "x,linkedin";
  try {
    const campaign = await createCampaign(session.user.id, {
      name,
      projectId,
      goal: body.goal,
      platforms,
      startAt,
      endAt,
      goalTarget: optionalNumber(body.goalTarget),
      baselineValue: optionalNumber(body.baselineValue),
      ctaTextX: typeof body.ctaTextX === "string" ? body.ctaTextX.trim().slice(0, 240) || null : null,
      ctaTextLinkedIn:
        typeof body.ctaTextLinkedIn === "string"
          ? body.ctaTextLinkedIn.trim().slice(0, 500) || null
          : null,
      destinationUrl:
        typeof body.destinationUrl === "string" && /^https?:\/\//i.test(body.destinationUrl.trim())
          ? body.destinationUrl.trim().slice(0, 2_000)
          : null,
      notes: typeof body.notes === "string" ? body.notes.trim().slice(0, 1_000) || null : null,
    });
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create campaign" },
      { status: 400 },
    );
  }
}
