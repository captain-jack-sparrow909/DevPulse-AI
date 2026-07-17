import assert from "node:assert/strict";
import test from "node:test";
import { parsePerformanceCsv, performanceCsvTemplate } from "@/lib/analytics/performance-csv";

test("performance CSV parses platform metrics and quoted notes", () => {
  const csv = [
    "postId,platform,impressions,likes,replies,reposts,saves,profileVisits,linkClicks,followersBefore,followersAfter,capturedAt,notes",
    'post-1,x,1000,20,3,2,4,9,5,100,102,2026-07-16T12:00:00Z,"24h, cumulative"',
  ].join("\n");
  const parsed = parsePerformanceCsv(csv);
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.records[0]?.platform, "x");
  assert.equal(parsed.records[0]?.impressions, 1000);
  assert.equal(parsed.records[0]?.notes, "24h, cumulative");
});

test("performance CSV rejects invalid platforms", () => {
  const parsed = parsePerformanceCsv("postId,platform\npost-1,threads");
  assert.equal(parsed.records.length, 0);
  assert.match(parsed.errors[0] || "", /platform must be x or linkedin/);
});

test("prefilled template creates separate X and LinkedIn rows", () => {
  const csv = performanceCsvTemplate([{ id: "post-1", title: "Architecture, explained" }]);
  const parsed = parsePerformanceCsv(csv);
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(parsed.records.map((record) => record.platform), ["x", "linkedin"]);
  assert.ok(parsed.records.every((record) => record.checkpoint === "24h"));
});

test("platform CSV mode accepts common X metric aliases with explicit DevPulse IDs", () => {
  const parsed = parsePerformanceCsv(
    "devpulsePostId,views,reactions,comments,retweets,bookmarks,clicks,checkpoint,capturedAt\npost-1,500,10,2,3,4,5,24h,2026-07-16T12:00:00Z",
    "x",
  );
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.records[0]?.platform, "x");
  assert.equal(parsed.records[0]?.impressions, 500);
  assert.equal(parsed.records[0]?.reposts, 3);
  assert.equal(parsed.records[0]?.saves, 4);
});
