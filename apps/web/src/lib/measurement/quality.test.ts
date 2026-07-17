import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMeasurementQueue,
  inferMeasurementCheckpoint,
  measurementAlerts,
  measurementCoverage,
  selectComparableCheckpointRecords,
  type MeasurementPostInput,
  type MeasurementSnapshotInput,
} from "@/lib/measurement/quality";

const postedAt = new Date("2026-07-01T12:00:00Z");

function snapshot(overrides: Partial<MeasurementSnapshotInput> = {}): MeasurementSnapshotInput {
  return {
    id: "snapshot-1",
    postId: "post-1",
    platform: "x",
    impressions: 100,
    likes: 5,
    replies: 1,
    reposts: 1,
    saves: 1,
    profileVisits: 2,
    linkClicks: 1,
    followersBefore: 100,
    followersAfter: 101,
    checkpoint: "24h",
    capturedAt: new Date("2026-07-02T12:00:00Z"),
    ...overrides,
  };
}

function post(snapshots: MeasurementSnapshotInput[] = []): MeasurementPostInput {
  return { id: "post-1", label: "Measured post", postedAt, snapshots };
}

test("checkpoint inference assigns only snapshots inside bounded age windows", () => {
  assert.equal(inferMeasurementCheckpoint(postedAt, new Date("2026-07-02T12:00:00Z")), "24h");
  assert.equal(inferMeasurementCheckpoint(postedAt, new Date("2026-07-03T12:00:00Z")), "custom");
  assert.equal(inferMeasurementCheckpoint(postedAt, new Date("2026-07-04T12:00:00Z")), "72h");
});

test("measurement queue marks completed and overdue platform checkpoints", () => {
  const tasks = buildMeasurementQueue([post([snapshot()])], new Date("2026-07-02T20:00:00Z"));
  assert.equal(tasks.find((item) => item.platform === "x" && item.checkpoint === "24h")?.status, "completed");
  assert.equal(tasks.find((item) => item.platform === "linkedin" && item.checkpoint === "24h")?.status, "overdue");
  const coverage = measurementCoverage(tasks);
  assert.equal(coverage.completed24h, 1);
  assert.equal(coverage.due24h, 2);
});

test("comparable selection excludes a mislabeled late snapshot", () => {
  const valid = snapshot();
  const mislabeled = snapshot({ id: "late", platform: "linkedin", capturedAt: new Date("2026-07-08T12:00:00Z"), checkpoint: "24h" });
  const selected = selectComparableCheckpointRecords([valid, mislabeled], new Map([["post-1", postedAt]]), "24h");
  assert.deepEqual(selected.map((item) => item.id), ["snapshot-1"]);
});

test("quality alerts flag cumulative regressions and partial follower values", () => {
  const alerts = measurementAlerts([post([
    snapshot({ id: "early", capturedAt: new Date("2026-07-01T13:00:00Z"), checkpoint: "1h", impressions: 200 }),
    snapshot({ id: "later", impressions: 100, followersAfter: null }),
  ])]);
  assert.ok(alerts.some((item) => item.message.includes("Cumulative metrics decreased")));
  assert.ok(alerts.some((item) => item.message.includes("Follower before/after")));
});
