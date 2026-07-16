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
  const existing = await prisma.ownedRepository.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!existing) return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  const body = (await request.json()) as Record<string, unknown>;
  const repository = await prisma.ownedRepository.update({
    where: { id },
    data: {
      active: typeof body.active === "boolean" ? body.active : undefined,
      name:
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim().slice(0, 80)
          : undefined,
    },
  });
  return NextResponse.json({ repository });
}
