import assert from "node:assert/strict";
import test from "node:test";
import { aggregateValidationMetrics, buildCheckpointSchedule, recommendValidationActions } from "@/lib/validation/study";

test("builds baseline plus four checkpoint boundaries over 30 days", () => {
  const start = new Date("2026-07-17T00:00:00.000Z");
  const schedule = buildCheckpointSchedule(start);
  assert.deepEqual(schedule.map((item) => item.sequence), [0, 1, 2, 3, 4]);
  assert.equal(schedule.at(-1)?.scheduledFor.toISOString(), "2026-08-16T00:00:00.000Z");
});

test("aggregates engagement, coverage, and explicit follower growth", () => {
  const metrics = aggregateValidationMetrics({
    publications: [{ postId: "p1", platform: "x" }, { postId: "p2", platform: "x" }],
    snapshots: [{ postId: "p1", platform: "x", impressions: 1000, likes: 20, replies: 4, reposts: 3, saves: 3, profileVisits: 12, linkClicks: 5 }],
    followerPoints: [
      { platform: "x", followers: 100, capturedAt: new Date("2026-07-01") },
      { platform: "x", followers: 108, capturedAt: new Date("2026-07-08") },
    ],
  });
  assert.equal(metrics.x.engagementRate, 3);
  assert.equal(metrics.x.followerGrowth, 8);
  assert.equal(metrics.measurementCoverage, 50);
});

test("does not recommend quality tuning with an insufficient sample", () => {
  const baseline = aggregateValidationMetrics({ snapshots: [], publications: [], followerPoints: [] });
  const actions = recommendValidationActions({ baseline, current: baseline, elapsedDays: 2, xPostsPerDay: 2, linkedInPostsPerWeek: 4 });
  assert.equal(actions.some((item) => item.category === "quality"), false);
  assert.equal(actions[0].category, "measurement");
});
