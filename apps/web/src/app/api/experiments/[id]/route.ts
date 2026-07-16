import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

async function getUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const experiment = await prisma.growthExperiment.findFirst({
    where: { id, userId: user.id },
  });
  if (!experiment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = (await request.json()) as { action?: string };
  if (body.action === "activate") {
    await prisma.$transaction([
      prisma.growthExperiment.updateMany({
        where: { userId: user.id, status: "active", id: { not: id } },
        data: { status: "paused" },
      }),
      prisma.growthExperiment.update({
        where: { id },
        data: { status: "active", startedAt: experiment.startedAt ?? new Date(), completedAt: null },
      }),
    ]);
  } else if (body.action === "pause") {
    await prisma.growthExperiment.update({ where: { id }, data: { status: "paused" } });
  } else if (body.action === "complete") {
    await prisma.growthExperiment.update({
      where: { id },
      data: { status: "completed", completedAt: new Date() },
    });
  } else {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const experiment = await prisma.growthExperiment.findFirst({
    where: { id, userId: user.id },
    include: { variants: { include: { _count: { select: { posts: true } } } } },
  });
  if (!experiment) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (experiment.variants.some((variant) => variant._count.posts > 0)) {
    return NextResponse.json({ error: "Experiments with assigned posts cannot be deleted" }, { status: 409 });
  }
  await prisma.growthExperiment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

