import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json()) as Record<string, unknown>;
  const text = typeof body.text === "string" ? body.text.trim().slice(0, 2_000) : "";
  const kind = ["question", "objection", "idea"].includes(String(body.kind))
    ? String(body.kind)
    : "question";
  if (text.length < 10) return NextResponse.json({ error: "Signal must contain at least 10 characters" }, { status: 400 });
  const opportunityId = typeof body.opportunityId === "string" ? body.opportunityId : undefined;
  const opportunity = opportunityId
    ? await prisma.engagementOpportunity.findFirst({ where: { id: opportunityId, userId: session.user.id } })
    : null;
  if (opportunityId && !opportunity) return NextResponse.json({ error: "Opportunity not found" }, { status: 404 });
  const signal = await prisma.contentSignal.create({
    data: {
      userId: session.user.id,
      opportunityId: opportunity?.id,
      kind,
      text,
      sourceUrl:
        typeof body.sourceUrl === "string"
          ? body.sourceUrl.trim().slice(0, 2_000) || null
          : opportunity?.url,
    },
  });
  return NextResponse.json({ signal }, { status: 201 });
}
