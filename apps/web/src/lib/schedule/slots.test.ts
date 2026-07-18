import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSlotPlan,
  contentRotationIndex,
  computeDailySlots,
  DEFAULT_DAILY_POST_TIMES,
  normalizeDailyPostTimes,
  parseDailyPostTimesJson,
} from "./slots";

test("uses the five configured Dubai wall-clock slots exactly", () => {
  const slots = computeDailySlots(
    new Date("2026-07-18T12:00:00.000Z"),
    "Asia/Dubai",
    6,
    21,
    5,
    DEFAULT_DAILY_POST_TIMES,
  );

  assert.deepEqual(
    slots.map((slot) => slot.toISOString()),
    [
      "2026-07-18T02:30:00.000Z",
      "2026-07-18T08:30:00.000Z",
      "2026-07-18T12:30:00.000Z",
      "2026-07-18T15:30:00.000Z",
      "2026-07-18T17:30:00.000Z",
    ],
  );
});

test("normalizes valid times and rejects malformed JSON values", () => {
  assert.deepEqual(
    normalizeDailyPostTimes(["21:30", "06:30", "06:30", "25:00", "oops"]),
    ["06:30", "21:30"],
  );
  assert.deepEqual(parseDailyPostTimesJson('["12:30","06:30"]'), ["06:30", "12:30"]);
  assert.deepEqual(parseDailyPostTimesJson("not-json"), []);
});

test("slot plan reports the explicit schedule length", () => {
  const plan = buildSlotPlan(
    new Date("2026-07-18T10:00:00.000Z"),
    "Asia/Dubai",
    6,
    21,
    12,
    DEFAULT_DAILY_POST_TIMES,
  );

  assert.equal(plan.postsPerDay, 5);
  assert.equal(plan.slots.length, 5);
  assert.deepEqual(plan.dueSlotIndexes, [0, 1]);
  assert.equal(plan.nextUpcomingIndex, 2);
});

test("editorial rotation continues across five-slot days", () => {
  const dayOneLast = contentRotationIndex(
    new Date("2026-07-18T17:30:00.000Z"),
    "Asia/Dubai",
    4,
    5,
  );
  const dayTwoFirst = contentRotationIndex(
    new Date("2026-07-19T02:30:00.000Z"),
    "Asia/Dubai",
    0,
    5,
  );

  assert.equal(dayTwoFirst, dayOneLast + 1);
});
