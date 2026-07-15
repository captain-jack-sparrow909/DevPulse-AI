import { prisma } from "@/lib/db";
import { contentHash } from "@/lib/hash";
import { buildSlotPlan, dayBoundsUtc } from "@/lib/schedule/slots";

async function getSettings(userId: string) {
  return prisma.userSettings.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
}

export async function getTodaySlotRows(userId: string) {
  const settings = await getSettings(userId);
  const now = new Date();
  const plan = buildSlotPlan(
    now,
    settings.timezone,
    settings.firstPostHour,
    settings.lastPostHour,
    settings.postsPerDay,
  );
  const { start, end } = dayBoundsUtc(now, settings.timezone);

  const schedules = await prisma.schedule.findMany({
    where: {
      scheduledFor: { gte: start, lte: end },
      post: { userId },
    },
    include: {
      post: {
        select: {
          id: true,
          title: true,
          status: true,
          platform: true,
          scoreOverall: true,
          hook: true,
        },
      },
    },
    orderBy: { slotIndex: "asc" },
  });

  const bySlot = new Map(schedules.map((s) => [s.slotIndex, s]));

  return {
    settings,
    plan,
    now,
    start,
    end,
    slots: plan.slots.map((slotAt, slotIndex) => {
      const row = bySlot.get(slotIndex);
      const isDue = plan.dueSlotIndexes.includes(slotIndex);
      const post = row?.post ?? null;
      const scheduleStatus = row?.status ?? null;
      const isSkipped =
        scheduleStatus === "skipped" || post?.status === "skipped";
      const isFilled = Boolean(row) && scheduleStatus !== "cancelled";
      return {
        slotIndex,
        scheduledFor: slotAt,
        isDue,
        isFilled,
        isSkipped,
        postId: post?.id ?? null,
        postStatus: post?.status ?? null,
        postTitle: post?.title || post?.hook || null,
        platform: post?.platform ?? null,
        scoreOverall: post?.scoreOverall ?? null,
        scheduleStatus,
      };
    }),
  };
}

/** Posts that occupy a slot for "already generated" purposes. */
export async function getOccupiedSlotIndexes(
  userId: string,
  timezone: string,
  now: Date,
): Promise<Set<number>> {
  const { start, end } = dayBoundsUtc(now, timezone);
  const rows = await prisma.schedule.findMany({
    where: {
      scheduledFor: { gte: start, lte: end },
      post: { userId },
      status: { not: "cancelled" },
    },
    select: { slotIndex: true },
  });
  return new Set(rows.map((r) => r.slotIndex));
}

/**
 * Remove today's posts for a slot so it can be regenerated.
 * Does not generate a new post — call runDueSlotGeneration after.
 */
export async function clearSlotForRegenerate(
  userId: string,
  slotIndex: number,
  timezone?: string,
): Promise<{ deleted: number }> {
  const resolvedTimezone = timezone || (await getSettings(userId)).timezone;
  const { start, end } = dayBoundsUtc(new Date(), resolvedTimezone);

  const deleted = await prisma.post.deleteMany({
    where: {
      userId,
      schedule: {
        is: {
          slotIndex,
          scheduledFor: { gte: start, lte: end },
        },
      },
    },
  });
  return { deleted: deleted.count };
}

/**
 * Mark a slot as intentionally skipped for today.
 * Cron will not try to fill it. Use regenerate later if you change your mind.
 */
export async function skipSlot(
  userId: string,
  slotIndex: number,
  reason?: string,
): Promise<{ slotIndex: number; postId: string }> {
  const settings = await getSettings(userId);
  const now = new Date();
  const plan = buildSlotPlan(
    now,
    settings.timezone,
    settings.firstPostHour,
    settings.lastPostHour,
    settings.postsPerDay,
  );

  if (slotIndex < 0 || slotIndex >= plan.slots.length) {
    throw new Error(`Invalid slotIndex ${slotIndex}`);
  }

  const { start, end } = dayBoundsUtc(now, settings.timezone);
  const existing = await prisma.schedule.findMany({
    where: {
      slotIndex,
      scheduledFor: { gte: start, lte: end },
      post: { userId },
    },
    include: { post: true },
  });

  const note = reason?.trim() || "Skipped by user";
  const scheduledFor = plan.slots[slotIndex]!;

  if (existing.length > 0) {
    // Mark all today's posts for this slot as skipped
    let lastId = existing[0]!.postId;
    for (const row of existing) {
      await prisma.post.update({
        where: { id: row.postId },
        data: {
          status: "skipped",
          rejectionReason: note,
        },
      });
      await prisma.schedule.update({
        where: { id: row.id },
        data: { status: "skipped" },
      });
      await prisma.readinessJob.updateMany({
        where: { postId: row.postId },
        data: { status: "cancelled", notes: note },
      });
      lastId = row.postId;
    }
    return { slotIndex, postId: lastId };
  }

  // Empty slot — placeholder so cron treats it as occupied
  const placeholder = `[Slot ${slotIndex + 1} skipped] ${note}`;
  const post = await prisma.post.create({
    data: {
      userId,
      platform: "x",
      format: "single",
      title: `Skipped slot ${slotIndex + 1}`,
      content: placeholder,
      status: "skipped",
      contentHash: contentHash(`${userId}:skip:${slotIndex}:${start.toISOString()}:${note}`),
      rejectionReason: note,
      needsImage: false,
      imageSkipReason: "Slot skipped — no content",
      schedule: {
        create: {
          scheduledFor,
          slotIndex,
          status: "skipped",
        },
      },
      readinessJobs: {
        create: {
          platform: "x",
          status: "cancelled",
          notes: note,
        },
      },
    },
  });

  return { slotIndex, postId: post.id };
}
