import assert from "node:assert/strict";
import test from "node:test";
import {
  attributedDestination,
  clickBucketStart,
  isObviousAutomatedRequest,
} from "./tracker";
import { buildAttributionReport } from "./report";

test("tracked redirect adds bounded UTM attribution", () => {
  const destination = attributedDestination({
    destinationUrl: "https://github.com/example/repo?ref=profile",
    appendUtm: true,
    platform: "x",
    slug: "abc123",
    campaignItem: { stage: "proof" },
    ctaVariant: "direct-value",
  });
  const url = new URL(destination);
  assert.equal(url.searchParams.get("ref"), "profile");
  assert.equal(url.searchParams.get("utm_source"), "x");
  assert.equal(url.searchParams.get("utm_campaign"), "abc123");
  assert.equal(url.searchParams.get("utm_content"), "proof-direct-value");
});

test("privacy filter identifies previews without persisting visitor data", () => {
  assert.equal(isObviousAutomatedRequest(new Headers({ purpose: "prefetch" })), true);
  assert.equal(isObviousAutomatedRequest(new Headers({ "user-agent": "LinkedInBot/1.0" })), true);
  assert.equal(isObviousAutomatedRequest(new Headers({ "user-agent": "Mozilla/5.0" })), false);
  assert.equal(
    clickBucketStart(new Date("2026-07-16T12:00:07.900Z")).toISOString(),
    "2026-07-16T12:00:05.000Z",
  );
});

test("attribution report uses the latest post snapshot and explicit conversions", () => {
  const report = buildAttributionReport({
    links: [{
      id: "link-1",
      platform: "x",
      postId: "post-1",
      clicksCount: 20,
      botHits: 3,
      ctaVariant: "direct-value",
      ctaPlacement: "final",
      stage: "proof",
      experimentVariant: "CTA test · Direct value",
    }],
    snapshots: [
      {
        postId: "post-1", platform: "x", impressions: 500, likes: 20, replies: 2,
        reposts: 1, saves: 3, profileVisits: 5, linkClicks: 8, followersBefore: 100,
        followersAfter: 101, capturedAt: new Date("2026-07-16T09:00:00Z"),
      },
      {
        postId: "post-1", platform: "x", impressions: 1000, likes: 30, replies: 4,
        reposts: 2, saves: 5, profileVisits: 10, linkClicks: 15, followersBefore: 100,
        followersAfter: 103, capturedAt: new Date("2026-07-16T12:00:00Z"),
      },
    ],
    conversions: [{ trackedLinkId: "link-1", postId: "post-1", platform: "x", value: 2, eventType: "github_star" }],
  });
  assert.equal(report.funnel.impressions, 1000);
  assert.equal(report.funnel.clicks, 20);
  assert.equal(report.funnel.conversions, 2);
  assert.equal(report.funnel.followersGained, 3);
  assert.equal(report.byStage[0]?.key, "proof");
  assert.equal(report.byStage[0]?.conversionRate, 10);
});
