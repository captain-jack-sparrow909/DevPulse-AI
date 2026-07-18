import assert from "node:assert/strict";
import test from "node:test";
import { assessRepositoryChange, buildProjectFact } from "./significance";

const base = {
  externalId: "abc123",
  kind: "commit" as const,
  title: "Implement incremental GitHub project sync",
  url: "https://github.com/example/repo/commit/abc123",
  occurredAt: new Date("2026-07-16T10:00:00Z"),
  changedFiles: ["src/lib/projects/sync.ts", "prisma/schema.prisma"],
  additions: 140,
  deletions: 12,
};

test("repository significance keeps a product implementation change", () => {
  assert.equal(assessRepositoryChange(base).meaningful, true);
});

test("repository significance filters dependency-lock noise", () => {
  assert.deepEqual(
    assessRepositoryChange({
      ...base,
      title: "chore: bump dependencies",
      changedFiles: ["package-lock.json"],
      additions: 20,
      deletions: 20,
    }),
    { score: 0, meaningful: false, reason: "Generated or dependency files only" },
  );
});

test("project fact uses evidence without inventing an outcome", () => {
  const fact = buildProjectFact(base);
  assert.match(fact.claim, /Implement incremental GitHub project sync/);
  assert.match(fact.claim, /src\/lib\/projects\/sync\.ts/);
  assert.doesNotMatch(fact.claim, /saved|improved|increased|reduced/i);
});

test("documentation facts preserve the exact reviewed claim and evidence", () => {
  const fact = buildProjectFact({
    ...base,
    kind: "documentation",
    externalId: "README.md:blob:table-5-relay",
    title: "README.md: Build pipeline optimizer",
    documentedFact: {
      title: "Build pipeline optimizer — Relay",
      claim: "Build pipeline optimizer is documented under Relay. Status: Included.",
      confidence: 0.92,
      evidence: { path: "README.md", blobSha: "blob", lineStart: 5, lineEnd: 5 },
    },
  });
  assert.equal(fact.title, "Build pipeline optimizer — Relay");
  assert.equal(fact.confidence, 0.92);
  assert.equal("path" in fact.evidence ? fact.evidence.path : null, "README.md");
});
