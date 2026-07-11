import { prisma } from "@/lib/db";

/**
 * Promote approved/scheduled posts whose slot time has arrived to `ready`
 * so the user can manually post them. Never touches social APIs.
 */
export async function promoteDuePosts(userId?: string): Promise<number> {
  const now = new Date();
  const due = await prisma.schedule.findMany({
    where: {
      status: { in: ["pending", "ready"] },
      scheduledFor: { lte: now },
      post: {
        ...(userId ? { userId } : {}),
        status: { in: ["approved", "scheduled"] },
      },
    },
    include: { post: true },
  });

  let count = 0;
  for (const slot of due) {
    await prisma.post.update({
      where: { id: slot.postId },
      data: { status: "ready" },
    });
    await prisma.schedule.update({
      where: { id: slot.id },
      data: { status: "ready" },
    });
    await prisma.readinessJob.updateMany({
      where: { postId: slot.postId },
      data: { status: "ready", readyAt: now },
    });
    count++;
  }
  return count;
}
