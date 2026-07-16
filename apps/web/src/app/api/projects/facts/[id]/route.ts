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
  const existing = await prisma.projectFact.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "Fact not found" }, { status: 404 });
  const body = (await request.json()) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const reviewStatus =
    action === "approve" ? "approved" : action === "reject" ? "rejected" : action === "reset" ? "pending" : null;
  if (!reviewStatus) return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  const fact = await prisma.projectFact.update({
    where: { id },
    data: { reviewStatus },
  });
  return NextResponse.json({ fact });
}
