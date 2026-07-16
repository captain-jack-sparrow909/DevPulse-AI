import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPerformanceReport,
  engagementCount,
  followUpSuggestion,
  latestPerformanceRecords,
  type PerformanceRecord,
} from "./performance";

function record(
  overrides: Partial<PerformanceRecord> & Pick<PerformanceRecord, "id" | "postId">,
): PerformanceRecord {
  const base: PerformanceRecord = {
    id: overrides.id,
    postId: overrides.postId,
    platform: "x",
    impressions: 1000,
    likes: 20,
    replies: 5,
    reposts: 3,
    saves: 2,
    profileVisits: 10,
    linkClicks: 5,
    followersBefore: 100,
    followersAfter: 103,
    capturedAt: new Date("2026-07-15T12:00:00.000Z"),
    post: {
      title: "A product lesson",
      hook: "A concrete hook",
      contentType: "project_lesson",
      angle: "Real project lesson",
      format: "dual-thread",
      mediaTypeX: "branded_visual",
      mediaTypeLinkedIn: "carousel",
      postedManuallyAt: new Date("2026-07-15T12:00:00.000Z"),
      schedule: null,
      sources: [
        {
          source: {
            provider: "project",
            externalId: "owned:intellitab:native-ipc",
            title: "IntelliTab: native IPC completion boundary",
          },
        },
      ],
    },
  };
  return { ...base, ...overrides };
}

test("engagement count includes meaningful actions but not impressions or profile visits", () => {
  assert.equal(engagementCount(record({ id: "one", postId: "post-one" })), 35);
});

test("latest snapshot wins for each post and platform", () => {
  const old = record({
    id: "old",
    postId: "post-one",
    impressions: 100,
    capturedAt: new Date("2026-07-15T10:00:00.000Z"),
  });
  const latest = record({
    id: "latest",
    postId: "post-one",
    impressions: 1000,
    capturedAt: new Date("2026-07-15T12:00:00.000Z"),
  });
  const linkedIn = record({
    id: "linkedin",
    postId: "post-one",
    platform: "linkedin",
  });
  assert.deepEqual(
    latestPerformanceRecords([old, latest, linkedIn]).map((item) => item.id).sort(),
    ["latest", "linkedin"],
  );
});

test("report aggregates latest cumulative metrics and derives product groups", () => {
  const records = [
    record({ id: "one", postId: "post-one" }),
    record({
      id: "two",
      postId: "post-two",
      impressions: 500,
      likes: 10,
      followersBefore: 103,
      followersAfter: 104,
    }),
    record({
      id: "three",
      postId: "post-three",
      platform: "linkedin",
      impressions: 1500,
      followersBefore: 104,
      followersAfter: 106,
      post: {
        ...record({ id: "base", postId: "base" }).post,
        contentType: "architecture_breakdown",
        sources: [],
      },
    }),
  ];
  const report = buildPerformanceReport(records, "Asia/Dubai");
  assert.equal(report.summary.trackedPosts, 3);
  assert.equal(report.summary.impressions, 3000);
  assert.equal(report.summary.followersGained, 6);
  assert.equal(report.byProject.find((group) => group.key === "intellitab")?.posts, 2);
  assert.equal(report.byProject.find((group) => group.key === "external")?.posts, 1);
  assert.ok(report.byPostingHour.some((group) => group.key === "16"));
  assert.equal(report.byMediaType.find((group) => group.key === "branded_visual")?.posts, 2);
  assert.equal(report.byMediaType.find((group) => group.key === "carousel")?.posts, 1);
  assert.ok(report.recommendations.length > 0);
});

test("small samples receive a collection recommendation instead of strategy changes", () => {
  const report = buildPerformanceReport([record({ id: "one", postId: "post-one" })]);
  assert.match(report.recommendations[0] || "", /Record both X and LinkedIn metrics/);
});

test("follow-up prioritizes active replies over generic recycling", () => {
  assert.match(
    followUpSuggestion(record({ id: "one", postId: "post-one", replies: 4 })),
    /Reply to each substantive comment/,
  );
});
