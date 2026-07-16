import assert from "node:assert/strict";
import test from "node:test";
import { buildCampaignPlan, CAMPAIGN_STAGE_COUNT } from "./definitions";

const project = {
  id: "intellitab",
  name: "IntelliTab",
  repository: "owner/IntelliTab",
  url: "https://github.com/owner/IntelliTab",
  description: "Local AI code completion for VS Code.",
};

test("campaign plan spreads seven narrative stages across the requested window", () => {
  const plan = buildCampaignPlan({
    project,
    facts: [
      { id: "f1", title: "Architecture", claim: "Uses a persistent local process.", sourceUrl: project.url },
      { id: "f2", title: "Protocol", claim: "Uses length-prefixed JSON.", sourceUrl: project.url },
      { id: "f3", title: "Progress", claim: "Added cancellation support.", sourceUrl: project.url },
      { id: "f4", title: "Benchmark", claim: "Targets 150–250ms first-token latency.", sourceUrl: project.url },
    ],
    signals: [{ id: "s1", kind: "question", text: "Why avoid HTTP?" }],
    startAt: new Date("2026-07-20T08:00:00Z"),
    endAt: new Date("2026-07-26T08:00:00Z"),
    ctaMode: "repository",
    destinationUrl: project.url,
  });
  assert.equal(plan.length, CAMPAIGN_STAGE_COUNT);
  assert.equal(plan.filter((item) => item.status === "blocked").length, 0);
  assert.equal(plan[0]?.stage, "problem");
  assert.equal(plan.at(-1)?.stage, "recap");
  assert.equal(plan.at(-1)?.scheduledFor.toISOString(), "2026-07-26T08:00:00.000Z");
});

test("campaign plan blocks unsupported proof and audience stages", () => {
  const plan = buildCampaignPlan({
    project,
    facts: [{ id: "f1", title: "Architecture", claim: "Uses a local process.", sourceUrl: project.url }],
    signals: [],
    startAt: new Date("2026-07-20T08:00:00Z"),
    endAt: new Date("2026-07-26T08:00:00Z"),
    ctaMode: "follow",
  });
  assert.equal(plan.find((item) => item.stage === "proof")?.status, "blocked");
  assert.equal(plan.find((item) => item.stage === "audience")?.status, "blocked");
  assert.equal(plan.find((item) => item.stage === "recap")?.status, "blocked");
});
