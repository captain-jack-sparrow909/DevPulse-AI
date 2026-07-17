import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAdaptivePublishingPlan,
  effectivePostsPerDay,
  generationQualityGate,
  linkedInPublishingDays,
  type AdaptiveCadenceSettings,
  type PublishingCandidate,
} from "./adaptive";

const settings: AdaptiveCadenceSettings = {
  adaptiveCadenceEnabled: true,
  postsPerDay: 12,
  xPostsPerDay: 2,
  linkedInPostsPerWeek: 4,
  qualityThreshold: 8,
  minimumNovelty: 7,
  projectCooldownHours: 36,
  contentTypeCooldownHours: 24,
};

function candidate(overrides: Partial<PublishingCandidate> = {}): PublishingCandidate {
  return {
    id: "post-1",
    title: "A grounded architecture lesson",
    status: "ready",
    createdAt: new Date("2026-07-13T07:00:00Z"),
    scheduledFor: new Date("2026-07-13T09:00:00Z"),
    scoreOverall: 8.8,
    scoreNovelty: 8.2,
    scoreEngagement: 8.4,
    scoreHook: 8.6,
    contentType: "architecture_breakdown",
    topicId: "topic-1",
    projectKey: "intellitab",
    hasEvidence: true,
    hasX: true,
    hasLinkedIn: true,
    ...overrides,
  };
}

test("adaptive mode reduces the generation day to the X cadence", () => {
  assert.equal(effectivePostsPerDay(settings), 2);
  assert.equal(effectivePostsPerDay({ ...settings, adaptiveCadenceEnabled: false }), 12);
});

test("adaptive generation refuses drafts below either quality floor", () => {
  assert.deepEqual(generationQualityGate({ overall: 8.4, novelty: 6.9 }, settings), [
    "novelty 6.9 < 7.0",
  ]);
  assert.deepEqual(
    generationQualityGate(
      { overall: 3, novelty: 2 },
      { ...settings, adaptiveCadenceEnabled: false },
    ),
    [],
  );
});

test("four LinkedIn posts are intentionally spread across the week", () => {
  assert.deepEqual(linkedInPublishingDays(4), [1, 2, 4, 6]);
});

test("plan selects a strong grounded post independently for active platforms", () => {
  const plan = buildAdaptivePublishingPlan({
    now: new Date("2026-07-13T08:00:00Z"),
    settings,
    candidates: [candidate()],
    publications: [],
    timingSamples: [],
  });
  assert.equal(
    plan.lanes.find((lane) => lane.platform === "x")?.selected[0]?.candidate.id,
    "post-1",
  );
  assert.equal(
    plan.lanes.find((lane) => lane.platform === "linkedin")?.selected[0]?.candidate.id,
    "post-1",
  );
});

test("weak or recently repeated drafts are intentionally skipped", () => {
  const plan = buildAdaptivePublishingPlan({
    now: new Date("2026-07-13T08:00:00Z"),
    settings,
    candidates: [candidate({ scoreNovelty: 6.2 })],
    publications: [
      {
        postId: "older-post",
        platform: "x",
        publishedAt: new Date("2026-07-12T20:00:00Z"),
        contentType: "project_lesson",
        topicId: "topic-2",
        projectKey: "intellitab",
      },
    ],
    timingSamples: [],
  });
  assert.equal(plan.intentionallySkipped.length, 1);
  assert.match(plan.intentionallySkipped[0]!.reasons.join(" "), /Novelty/);
  assert.match(plan.intentionallySkipped[0]!.reasons.join(" "), /Project cooldown/);
});

test("measured engagement selects the strongest supported posting hour", () => {
  const plan = buildAdaptivePublishingPlan({
    now: new Date("2026-07-13T08:00:00Z"),
    settings,
    candidates: [candidate()],
    publications: [],
    timingSamples: [
      { platform: "x", hour: 9, impressions: 1000, engagements: 20 },
      { platform: "x", hour: 9, impressions: 800, engagements: 16 },
      { platform: "x", hour: 18, impressions: 600, engagements: 36 },
      { platform: "x", hour: 18, impressions: 500, engagements: 30 },
    ],
  });
  assert.equal(
    plan.lanes.find((lane) => lane.platform === "x")?.recommendedHour,
    18,
  );
});
