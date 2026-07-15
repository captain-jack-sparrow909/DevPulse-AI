import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONTENT_STRATEGY } from "@/lib/content/strategy";
import type { RawSourceItem } from "@/lib/integrations/types";
import {
  externalProvidersForContentType,
  filterSourcesForContentType,
} from "./source-policy";
import { researchChunkCount } from "./chunks";

function source(
  provider: RawSourceItem["provider"],
  title: string,
  overrides: Partial<RawSourceItem> = {},
): RawSourceItem {
  return {
    provider,
    externalId: `${provider}:${title}`,
    title,
    url: `https://example.com/${provider}`,
    ...overrides,
  };
}

test("removed providers are absent from every generation lane", () => {
  const active = new Set(
    DEFAULT_CONTENT_STRATEGY.contentMix.flatMap((item) =>
      externalProvidersForContentType(item.type),
    ),
  );
  for (const removed of ["devto", "stackoverflow", "producthunt", "tavily", "x"]) {
    assert.equal(active.has(removed as RawSourceItem["provider"]), false);
  }
});

test("phased research skips external work for project lessons", () => {
  assert.equal(researchChunkCount("project_lesson"), 0);
  assert.equal(researchChunkCount("architecture_breakdown"), 1);
  assert.equal(researchChunkCount("experiment_benchmark"), 1);
  assert.equal(researchChunkCount("evidence_opinion"), 1);
  assert.equal(researchChunkCount("curated_discovery"), 2);
});

test("project lessons reject all external research", () => {
  const filtered = filterSourcesForContentType(
    [
      source("project", "IntelliTab native IPC"),
      source("github", "AI code completion developer tool"),
    ],
    "project_lesson",
    DEFAULT_CONTENT_STRATEGY,
  );
  assert.deepEqual(filtered.map((item) => item.provider), ["project"]);
});

test("selective research accepts product-related papers and rejects off-topic ones", () => {
  const filtered = filterSourcesForContentType(
    [
      source("arxiv", "Speculative decoding for code completion"),
      source("arxiv", "Monocular reconstruction for dermatology"),
      source("hackernews", "AI agent discussion"),
    ],
    "experiment_benchmark",
    DEFAULT_CONTENT_STRATEGY,
  );
  assert.deepEqual(filtered.map((item) => item.title), [
    "Speculative decoding for code completion",
  ]);
});

test("community sources only survive the opinion lane and remain capped", () => {
  const items = Array.from({ length: 6 }, (_, index) =>
    source("hackernews", `AI agent tool use ${index}`),
  );
  const opinion = filterSourcesForContentType(
    items,
    "evidence_opinion",
    DEFAULT_CONTENT_STRATEGY,
  );
  const architecture = filterSourcesForContentType(
    items,
    "architecture_breakdown",
    DEFAULT_CONTENT_STRATEGY,
  );
  assert.equal(opinion.length, 3);
  assert.equal(architecture.length, 0);
});

test("RSS requires an official high-priority AI or engineering feed", () => {
  const filtered = filterSourcesForContentType(
    [
      source("rss", "Code completion architecture", {
        priority: 5,
        raw: { category: "engineering" },
      }),
      source("rss", "AI code completion launch", {
        priority: 3,
        raw: { category: "tech_news" },
      }),
    ],
    "architecture_breakdown",
    DEFAULT_CONTENT_STRATEGY,
  );
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0]?.priority, 5);
});
