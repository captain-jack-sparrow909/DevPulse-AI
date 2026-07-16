import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateGroundedReply } from "@/lib/distribution/reply";

export const maxDuration = 30;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  try {
    const result = await generateGroundedReply(session.user.id, id);
    await prisma.engagementOpportunity.updateMany({
      where: { id, userId: session.user.id },
      data: { suggestedReply: result.reply },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not draft reply" },
      { status: 404 },
    );
  }
}
