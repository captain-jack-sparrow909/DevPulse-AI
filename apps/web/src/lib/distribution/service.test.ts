import assert from "node:assert/strict";
import test from "node:test";
import { buildDistributionComparison, nextWorkflowAction, workflowUpdate } from "./service";

test("distribution workflow exposes the next uncompleted manual action", () => {
  const workflow = {
    assetReadyAt: new Date(),
    preEngagedAt: new Date(),
    publishedAt: null,
    commentsReviewedAt: null,
    metricsCapturedAt: null,
    completedAt: null,
  };
  assert.equal(nextWorkflowAction(workflow), "Publish manually");
  assert.deepEqual(workflowUpdate("published", new Date("2026-07-16T10:00:00Z")), {
    publishedAt: new Date("2026-07-16T10:00:00Z"),
    status: "published",
  });
});

test("distribution comparison uses the latest platform snapshot", () => {
  const base = {
    postId: "post-1",
    platform: "x",
    likes: 10,
    replies: 2,
    reposts: 1,
    saves: 1,
    linkClicks: 1,
    followersBefore: 100,
    followersAfter: 103,
  };
  const report = buildDistributionComparison(
    [{ postId: "post-1", platform: "x", preEngagedAt: new Date() }],
    [
      { ...base, impressions: 500, capturedAt: new Date("2026-07-16T09:00:00Z") },
      { ...base, impressions: 1000, capturedAt: new Date("2026-07-16T12:00:00Z") },
    ],
  );
  assert.equal(report.assisted.records, 1);
  assert.equal(report.assisted.impressions, 1000);
  assert.equal(report.assisted.followersGained, 3);
  assert.equal(report.baseline.records, 0);
});
