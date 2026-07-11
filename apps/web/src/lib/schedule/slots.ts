import {
  addMinutes,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
  startOfDay,
  endOfDay,
} from "date-fns";
import { toZonedTime, fromZonedTime } from "date-fns-tz";

/**
 * 12 slots between firstHour (default 6) and lastHour (default 21) in the user's timezone.
 * Evenly spaced so first is 06:00 and last is 21:00 (UAE default: Asia/Dubai).
 */
export function computeDailySlots(
  date: Date,
  timezone: string,
  firstHour = 6,
  lastHour = 21,
  count = 12,
): Date[] {
  const zoned = toZonedTime(date, timezone);
  const dayStart = setMilliseconds(setSeconds(setMinutes(setHours(zoned, firstHour), 0), 0), 0);
  const totalMinutes = (lastHour - firstHour) * 60;
  const step = count <= 1 ? 0 : totalMinutes / (count - 1);

  const slots: Date[] = [];
  for (let i = 0; i < count; i++) {
    const local = addMinutes(dayStart, Math.round(step * i));
    slots.push(fromZonedTime(local, timezone));
  }
  return slots;
}

/** Start/end of "today" in the given timezone, as UTC Date bounds for DB queries. */
export function dayBoundsUtc(date: Date, timezone: string): { start: Date; end: Date } {
  const zoned = toZonedTime(date, timezone);
  const localStart = startOfDay(zoned);
  const localEnd = endOfDay(zoned);
  return {
    start: fromZonedTime(localStart, timezone),
    end: fromZonedTime(localEnd, timezone),
  };
}

export function formatSlotLabel(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export function formatSlotDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export interface SlotPlan {
  slots: Date[];
  timezone: string;
  postsPerDay: number;
  firstHour: number;
  lastHour: number;
  /** Slot times that have already arrived (now >= slot time). */
  dueSlotIndexes: number[];
  /** Next slot that has not arrived yet, if any. */
  nextUpcomingIndex: number | null;
  nextUpcomingAt: Date | null;
}

export function buildSlotPlan(
  now: Date,
  timezone: string,
  firstHour = 6,
  lastHour = 21,
  postsPerDay = 12,
): SlotPlan {
  const slots = computeDailySlots(now, timezone, firstHour, lastHour, postsPerDay);
  const dueSlotIndexes: number[] = [];
  let nextUpcomingIndex: number | null = null;
  let nextUpcomingAt: Date | null = null;

  for (let i = 0; i < slots.length; i++) {
    const t = slots[i]!;
    if (now.getTime() >= t.getTime()) {
      dueSlotIndexes.push(i);
    } else if (nextUpcomingIndex === null) {
      nextUpcomingIndex = i;
      nextUpcomingAt = t;
    }
  }

  return {
    slots,
    timezone,
    postsPerDay,
    firstHour,
    lastHour,
    dueSlotIndexes,
    nextUpcomingIndex,
    nextUpcomingAt,
  };
}

/**
 * Earliest due slot that still needs a post for today.
 * Returns null if nothing is due yet, or all due slots already have posts.
 */
export function pickNextMissingDueSlot(
  plan: SlotPlan,
  filledSlotIndexes: Set<number>,
): { slotIndex: number; scheduledFor: Date } | null {
  for (const idx of plan.dueSlotIndexes) {
    if (!filledSlotIndexes.has(idx)) {
      return { slotIndex: idx, scheduledFor: plan.slots[idx]! };
    }
  }
  return null;
}
