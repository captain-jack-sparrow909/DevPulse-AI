import assert from "node:assert/strict";
import test from "node:test";
import { engagementBriefForSlot } from "@/lib/content/engagement";
import { DEFAULT_CONTENT_STRATEGY, contentTypeForSlot } from "@/lib/content/strategy";
import { analyzeExperiment, type ExperimentVariantInput } from "@/lib/experiments/analysis";
import { applyBriefOverrides, chooseBalancedVariant } from "@/lib/experiments/definitions";

test("balanced assignment chooses a least-used variant", () => {
  const selected = chooseBalancedVariant(
    [
      { id: "a", assignedPosts: 4 },
      { id: "b", assignedPosts: 2 },
      { id: "c", assignedPosts: 3 },
    ],
    9,
  );
  assert.equal(selected?.id, "b");
});

test("platform overrides do not overwrite the base brief", () => {
  const contentType = contentTypeForSlot(0, DEFAULT_CONTENT_STRATEGY.contentMix);
  const base = engagementBriefForSlot(0, contentType);
  const result = applyBriefOverrides(base, [
    { platform: "x", config: { hookPattern: "technical-tension" } },
    { platform: "linkedin", config: { endingPattern: "practical-takeaway" } },
  ]);
  assert.equal(result.hookPattern, base.hookPattern);
  assert.equal(result.platformOverrides?.x?.hookPattern, "technical-tension");
  assert.equal(result.platformOverrides?.linkedin?.endingPattern, "practical-takeaway");
});

function variant(id: string, rates: number[]): ExperimentVariantInput {
  return {
    id,
    key: id,
    label: id.toUpperCase(),
    configJson: JSON.stringify({ hookPattern: id === "a" ? "build-decision" : "technical-tension" }),
    assignedPosts: rates.length,
    performance: rates.map((engagements, index) => ({
      id: `${id}-${index}`,
      postId: `${id}-post-${index}`,
      platform: "x",
      impressions: 100,
      likes: engagements,
      replies: 0,
      reposts: 0,
      saves: 0,
      profileVisits: 0,
      linkClicks: 0,
      followersBefore: null,
      followersAfter: null,
      capturedAt: new Date(`2026-07-${String(index + 1).padStart(2, "0")}T12:00:00Z`),
    })),
  };
}

test("experiment waits until every variant reaches the minimum sample", () => {
  const result = analyzeExperiment({
    variants: [variant("a", [2, 3, 2]), variant("b", [5, 6])],
    metric: "engagement_rate",
    platform: "x",
    minSamplePerVariant: 3,
  });
  assert.equal(result.status, "collecting");
  assert.match(result.rationale, /B: 1 more/);
});

test("experiment recommends a material winner after comparable samples", () => {
  const result = analyzeExperiment({
    variants: [variant("a", [2, 2, 2]), variant("b", [6, 5, 7])],
    metric: "engagement_rate",
    platform: "x",
    minSamplePerVariant: 3,
  });
  assert.equal(result.status, "winner");
  assert.equal(result.winner?.id, "b");
  assert.equal(result.winner?.metricValue, 6);
});

