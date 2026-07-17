import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { executionPlanIcs } from "@/lib/execution-plan/calendar";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const plan = await prisma.weeklyExecutionPlan.findFirst({
    where: { id, userId: session.user.id },
    include: { items: { orderBy: { sequence: "asc" } } },
  });
  if (!plan) return NextResponse.json({ error: "Execution plan not found" }, { status: 404 });

  const calendar = executionPlanIcs(plan);
  return new NextResponse(calendar, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="devpulse-${plan.weekKey}.ics"`,
      "cache-control": "private, no-store",
    },
  });
}
