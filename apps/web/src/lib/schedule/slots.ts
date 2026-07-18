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

export const DEFAULT_DAILY_POST_TIMES = [
  "06:30",
  "12:30",
  "16:30",
  "19:30",
  "21:30",
] as const;

const DAILY_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Validate, deduplicate, and sort local wall-clock post times. */
export function normalizeDailyPostTimes(
  times: readonly string[] | null | undefined,
): string[] {
  if (!times) return [];
  return [...new Set(
    times
      .map((time) => time.trim())
      .filter((time) => DAILY_TIME_PATTERN.test(time)),
  )].sort((a, b) => a.localeCompare(b));
}

export function parseDailyPostTimesJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? normalizeDailyPostTimes(parsed.filter((value): value is string => typeof value === "string"))
      : [];
  } catch {
    return [];
  }
}

export function dailyPostTimesFromSettings(settings: {
  dailyPostTimesJson?: string | null;
}): string[] {
  return parseDailyPostTimesJson(settings.dailyPostTimesJson);
}

/**
 * Continue the editorial mix across local calendar days instead of restarting
 * the weighted rotation at slot zero every morning.
 */
export function contentRotationIndex(
  date: Date,
  timezone: string,
  slotIndex: number,
  slotsPerDay: number,
): number {
  const zoned = toZonedTime(date, timezone);
  const localDayNumber = Math.floor(
    Date.UTC(zoned.getFullYear(), zoned.getMonth(), zoned.getDate()) / 86_400_000,
  );
  return localDayNumber * Math.max(1, slotsPerDay) + slotIndex;
}

/**
 * Explicit local wall-clock times when configured; otherwise evenly spaced
 * slots between firstHour and lastHour in the user's timezone.
 */
export function computeDailySlots(
  date: Date,
  timezone: string,
  firstHour = 6,
  lastHour = 21,
  count = 12,
  dailyPostTimes: readonly string[] = [],
): Date[] {
  const zoned = toZonedTime(date, timezone);
  const explicitTimes = normalizeDailyPostTimes(dailyPostTimes);

  if (explicitTimes.length > 0) {
    return explicitTimes.map((time) => {
      const [hour, minute] = time.split(":").map(Number);
      const local = setMilliseconds(
        setSeconds(setMinutes(setHours(zoned, hour!), minute!), 0),
        0,
      );
      return fromZonedTime(local, timezone);
    });
  }

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
  dailyPostTimes: readonly string[] = [],
): SlotPlan {
  const slots = computeDailySlots(
    now,
    timezone,
    firstHour,
    lastHour,
    postsPerDay,
    dailyPostTimes,
  );
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
    postsPerDay: slots.length,
    firstHour,
    lastHour,
    dueSlotIndexes,
    nextUpcomingIndex,
    nextUpcomingAt,
  };
}

/**
 * Start preparing a slot this many ms before its wall-clock time so the draft
 * is ready *by* the slot (e.g. 6:00 post prepared from ~5:10).
 * ~50 min is less than the ~82 min gap between 12 slots (06:00–21:00).
 */
export const SLOT_PREP_LEAD_MS = 50 * 60 * 1000;

/**
 * How many slots behind "current due" we still retry before auto-skipping.
 * 1 = catch up one lagging slot; older empty dues are abandoned.
 */
export const SLOT_RETRY_LAG = 1;

export type SlotPickMode = "prep_early" | "due_or_retry";

export interface SlotPick {
  slotIndex: number;
  scheduledFor: Date;
  mode: SlotPickMode;
}

/**
 * Choose the next slot the cron should fill automatically.
 *
 * Policy (ready-by + retry, no multi-hour backlog dump):
 * 1. Walk slots in order (0 → 11). First unfilled slot whose prep window has
 *    opened (`dueTime - SLOT_PREP_LEAD`) is the candidate.
 * 2. If that slot is still empty after due time, every cron tick retries it
 *    until it succeeds — no user click required.
 * 3. If several dues are empty and the clock has moved on, only retry within
 *    SLOT_RETRY_LAG of the latest due index; older ones are stale (auto-skip).
 */
export function pickSlotForGeneration(
  plan: SlotPlan,
  filledSlotIndexes: Set<number>,
  now: Date = new Date(),
  prepLeadMs: number = SLOT_PREP_LEAD_MS,
): SlotPick | null {
  const currentDueIdx =
    plan.dueSlotIndexes.length > 0
      ? plan.dueSlotIndexes[plan.dueSlotIndexes.length - 1]!
      : -1;
  const nowMs = now.getTime();

  for (let i = 0; i < plan.slots.length; i++) {
    if (filledSlotIndexes.has(i)) continue;

    const scheduledFor = plan.slots[i]!;
    const dueMs = scheduledFor.getTime();
    const prepOpensMs = dueMs - prepLeadMs;
    const isDue = nowMs >= dueMs;
    const inPrep = !isDue && nowMs >= prepOpensMs;

    if (!isDue && !inPrep) {
      // Next unfilled slot is still too early — wait for its prep window
      return null;
    }

    // Too far behind the live wall-clock due slot → leave for auto-skip
    if (isDue && currentDueIdx >= 0 && i < currentDueIdx - SLOT_RETRY_LAG) {
      continue;
    }

    return {
      slotIndex: i,
      scheduledFor,
      mode: isDue ? "due_or_retry" : "prep_early",
    };
  }

  return null;
}

/**
 * The current wall-clock due slot only (most recent slot whose time has arrived).
 * Kept for UI labels / summary.
 */
export function pickLatestMissingDueSlot(
  plan: SlotPlan,
  filledSlotIndexes: Set<number>,
): { slotIndex: number; scheduledFor: Date } | null {
  if (plan.dueSlotIndexes.length === 0) return null;
  const currentIdx = plan.dueSlotIndexes[plan.dueSlotIndexes.length - 1]!;
  if (filledSlotIndexes.has(currentIdx)) return null;
  return { slotIndex: currentIdx, scheduledFor: plan.slots[currentIdx]! };
}

/**
 * Due slots earlier than `beforeSlotIndex` that were never filled.
 */
export function listMissedDueSlotsBefore(
  plan: SlotPlan,
  filledSlotIndexes: Set<number>,
  beforeSlotIndex: number,
): number[] {
  return plan.dueSlotIndexes.filter(
    (idx) => idx < beforeSlotIndex && !filledSlotIndexes.has(idx),
  );
}

/**
 * Empty due slots that are too old to retry (behind live due by more than lag).
 */
export function listStaleMissedDueSlots(
  plan: SlotPlan,
  filledSlotIndexes: Set<number>,
): number[] {
  if (plan.dueSlotIndexes.length === 0) return [];
  const currentIdx = plan.dueSlotIndexes[plan.dueSlotIndexes.length - 1]!;
  return plan.dueSlotIndexes.filter((idx) => {
    if (filledSlotIndexes.has(idx)) return false;
    return idx < currentIdx - SLOT_RETRY_LAG;
  });
}

/**
 * When the current due slot is already filled, older empty dues to mark skipped.
 */
export function listAllMissedDueSlots(
  plan: SlotPlan,
  filledSlotIndexes: Set<number>,
): number[] {
  return listStaleMissedDueSlots(plan, filledSlotIndexes);
}

/** @deprecated Prefer pickSlotForGeneration / pickLatestMissingDueSlot */
export function pickNextMissingDueSlot(
  plan: SlotPlan,
  filledSlotIndexes: Set<number>,
): { slotIndex: number; scheduledFor: Date } | null {
  return pickLatestMissingDueSlot(plan, filledSlotIndexes);
}
