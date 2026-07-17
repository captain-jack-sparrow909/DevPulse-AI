import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_CONTENT_STRATEGY } from "@/lib/content/strategy";
import { executionPlanIcs } from "@/lib/execution-plan/calendar";
import { buildExecutionPlan } from "@/lib/execution-plan/engine";

function plan() {
  return buildExecutionPlan({
    startDate: new Date("2026-07-18T00:00:00.000Z"),
    timezone: "Asia/Dubai",
    firstPostHour: 6,
    lastPostHour: 21,
    postsPerDay: 12,
    strategy: DEFAULT_CONTENT_STRATEGY,
    reviewId: "review-1",
    reviewStatus: "reviewed",
    reviewSummary: { headline: "Project lessons are producing the strongest comparable evidence." },
    reviewBrief: { focus: "Show implementation boundaries.", guardrail: "Use verified facts only.", experiment: "Compare direct and question hooks." },
    decisions: [
      { id: "continue", category: "continue", title: "Keep project lessons", status: "applied", action: { type: "hold_mix" } },
      { id: "reduce", category: "reduce", title: "Reduce generic discovery", status: "rejected", action: { type: "hold_mix" } },
      { id: "test", category: "test", title: "Test hooks", status: "applied", action: { type: "create_experiment" } },
    ],
    activeExperiments: [{ id: "experiment-1", name: "Hook test", platform: "x", dimension: "opening_hook" }],
    activeCampaigns: [{ id: "campaign-1", name: "DevPulse launch", projectId: "devpulse-ai", ctaMode: "tracked_link", destinationUrl: "https://example.com" }],
  });
}

test("weekly execution plan creates one anchor on each of seven local days", () => {
  const result = plan();
  assert.equal(result.items.length, 7);
  const localDays = new Set(result.items.map((item) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" }).format(item.scheduledFor)));
  assert.equal(localDays.size, 7);
  assert.deepEqual([...new Set(result.items.map((item) => item.slotIndex))], [3, 6, 8]);
});

test("plan rotates owned projects and attaches only compatible campaign guidance", () => {
  const result = plan();
  assert.deepEqual(result.items.slice(0, 3).map((item) => item.projectName), ["DevPulse AI", "Röntgen AI", "IntelliTab"]);
  assert.equal(result.items[0]?.campaignId, "campaign-1");
  assert.equal(result.items[1]?.campaignId, null);
  assert.ok(result.items.every((item) => item.experimentId === "experiment-1"));
});

test("plan preserves manual-review safety and comparable checkpoints", () => {
  const result = plan();
  assert.match(result.brief.operatingRules.join(" "), /human review and manual publishing/i);
  assert.deepEqual(result.items[0]?.measurement.checkpoints, ["1h", "24h", "72h", "7d"]);
  assert.deepEqual(result.items[0]?.sourceDecisionIds, ["continue", "test"]);
});

test("calendar export contains active anchors but excludes rejected ones", () => {
  const result = plan();
  const items = result.items.map((item, index) => ({ ...item, id: `item-${index}`, status: index === 1 ? "rejected" : "approved" }));
  const calendar = executionPlanIcs({ id: "plan-1", weekKey: "2026-07-18", timezone: "Asia/Dubai", items }, new Date("2026-07-17T00:00:00Z"));
  assert.match(calendar, /^BEGIN:VCALENDAR\r\n/);
  assert.match(calendar, /Safety: review the generated draft and publish manually/);
  assert.equal((calendar.match(/BEGIN:VEVENT/g) || []).length, 6);
  assert.doesNotMatch(calendar, /item-1@devpulse\.ai/);
});
