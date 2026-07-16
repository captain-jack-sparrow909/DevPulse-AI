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
