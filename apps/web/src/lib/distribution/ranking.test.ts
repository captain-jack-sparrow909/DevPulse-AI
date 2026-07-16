import assert from "node:assert/strict";
import test from "node:test";
import { auditReply, rankOpportunity, safeReplyFallback } from "./ranking";

test("fresh technical conversations rank above stale generic ones", () => {
  const now = new Date("2026-07-16T12:00:00Z");
  const technical = rankOpportunity({
    context: "Local AI inference latency for a VS Code extension",
    topic: "Developer tooling",
    author: "builder",
    discoveredAt: new Date("2026-07-16T10:00:00Z"),
    status: "new",
    relationshipPriority: 70,
  }, now);
  const generic = rankOpportunity({
    context: "A general update",
    discoveredAt: new Date("2026-07-10T10:00:00Z"),
    status: "new",
  }, now);
  assert.ok(technical.score > generic.score);
  assert.match(technical.reason, /active conversation/);
});

test("reply audit blocks links and generic engagement bait", () => {
  const failures = auditReply("Great post! https://example.com #AI", "x");
  assert.ok(failures.length >= 3);
});

test("fallback reply stays within the X limit", () => {
  const reply = safeReplyFallback("local inference latency");
  assert.ok(reply.length <= 280);
  assert.equal(auditReply(reply, "x").length, 0);
});
