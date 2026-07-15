import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CONTENT_STRATEGY,
  contentTypeForSlot,
  orderCandidatesForStrategy,
  projectSources,
  strategyRelevanceScore,
  strategyFromRecord,
  strategyToRecord,
} from "./strategy";
import type { RawSourceItem } from "@/lib/integrations/types";

test("default strategy contains all three owned projects", () => {
  assert.deepEqual(
    DEFAULT_CONTENT_STRATEGY.projects.map((project) => project.repository),
    [
      "captain-jack-sparrow909/DevPulse-AI",
      "captain-jack-sparrow909/rontgenai",
      "captain-jack-sparrow909/IntelliTab",
    ],
  );
});

test("owned projects are split into focused, reusable fact cards", () => {
  const sources = projectSources(DEFAULT_CONTENT_STRATEGY);
  assert.equal(sources.length, 7);
  assert.equal(new Set(sources.map((source) => source.externalId)).size, 7);
  assert.ok(
    sources.some(
      (source) =>
        source.externalId === "owned:devpulse-ai:manual-publishing" &&
        source.summary?.includes("never publishes to X or LinkedIn"),
    ),
  );
  assert.ok(
    sources.some(
      (source) =>
        source.externalId === "owned:intellitab:local-model-target" &&
        source.summary?.includes("target, not a guaranteed measured result"),
    ),
  );
});

test("content rotation preserves and distributes the product-first 5/2/1/1/1 mix", () => {
  const firstCycle = Array.from({ length: 10 }, (_, index) =>
    contentTypeForSlot(index, DEFAULT_CONTENT_STRATEGY.contentMix).type,
  );
  const counts = new Map<string, number>();
  for (const type of firstCycle) counts.set(type, (counts.get(type) ?? 0) + 1);

  assert.equal(counts.get("project_lesson"), 5);
  assert.equal(counts.get("architecture_breakdown"), 2);
  assert.equal(counts.get("evidence_opinion"), 1);
  assert.equal(counts.get("experiment_benchmark"), 1);
  assert.equal(counts.get("curated_discovery"), 1);
  assert.equal(firstCycle.some((type, index) => type === "project_lesson" && firstCycle[index + 1] === type), false);
});

test("legacy Phase 2 default mix upgrades without overriding custom mixes", () => {
  const legacy = {
    ...DEFAULT_CONTENT_STRATEGY,
    contentMix: DEFAULT_CONTENT_STRATEGY.contentMix.map((item) => ({
      ...item,
      weight:
        item.type === "project_lesson"
          ? 4
          : item.type === "evidence_opinion"
            ? 2
            : item.weight,
    })),
  };
  const upgraded = strategyFromRecord(strategyToRecord(legacy));
  assert.equal(
    upgraded.contentMix.find((item) => item.type === "project_lesson")?.weight,
    5,
  );
  assert.equal(
    upgraded.contentMix.find((item) => item.type === "evidence_opinion")?.weight,
    1,
  );
});

test("off-brand medical content is rejected by strategy relevance", () => {
  const source: RawSourceItem = {
    provider: "arxiv",
    externalId: "dermdepth",
    title: "DermDepth: monocular 3D reconstruction for dermatology",
    url: "https://example.com/dermdepth",
    score: 100,
  };
  assert.equal(strategyRelevanceScore(source, DEFAULT_CONTENT_STRATEGY), -1_000);
});

test("owned projects outrank popular unrelated sources for project lessons", () => {
  const owned = projectSources(DEFAULT_CONTENT_STRATEGY).find(
    (item) => item.externalId === "owned:intellitab:native-ipc",
  )!;
  const unrelated: RawSourceItem = {
    provider: "github",
    externalId: "popular-unrelated",
    title: "Popular consumer photo application",
    url: "https://example.com/popular",
    score: 50_000,
  };
  const ordered = orderCandidatesForStrategy(
    [
      { id: "unrelated", item: unrelated },
      { id: "owned", item: owned },
    ],
    {
      strategy: DEFAULT_CONTENT_STRATEGY,
      contentType: "project_lesson",
      usedSourceIds: new Set(),
      usedProviderCounts: new Map(),
    },
  );
  assert.equal(ordered[0]?.id, "owned");
});

test("curated slots prefer relevant external discoveries over owned context", () => {
  const owned = projectSources(DEFAULT_CONTENT_STRATEGY).find(
    (item) => item.externalId === "owned:devpulse-ai:phased-execution",
  )!;
  const discovery: RawSourceItem = {
    provider: "rss",
    externalId: "agent-evals",
    title: "Evaluating LLM agent tool-use pipelines in production",
    url: "https://example.com/evals",
    score: 70,
  };
  const ordered = orderCandidatesForStrategy(
    [
      { id: "owned", item: owned },
      { id: "discovery", item: discovery },
    ],
    {
      strategy: DEFAULT_CONTENT_STRATEGY,
      contentType: "curated_discovery",
      usedSourceIds: new Set(),
      usedProviderCounts: new Map(),
    },
  );
  assert.equal(ordered[0]?.id, "discovery");
});
