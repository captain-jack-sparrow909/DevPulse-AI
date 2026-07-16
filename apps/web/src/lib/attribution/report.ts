export interface AttributionLinkInput {
  id: string;
  platform: string;
  postId: string | null;
  clicksCount: number;
  botHits: number;
  ctaVariant: string;
  ctaPlacement: string;
  stage: string | null;
  experimentVariant?: string | null;
}

export interface AttributionSnapshotInput {
  postId: string;
  platform: string;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  saves: number;
  profileVisits: number;
  linkClicks: number;
  followersBefore: number | null;
  followersAfter: number | null;
  capturedAt: Date;
}

export interface AttributionConversionInput {
  trackedLinkId: string | null;
  postId: string | null;
  platform: string | null;
  value: number;
  eventType: string;
}

export interface AttributionBreakdown {
  key: string;
  label: string;
  links: number;
  impressions: number;
  clicks: number;
  clickRate: number;
  conversions: number;
  conversionRate: number;
}

function rate(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : 0;
}

function latestSnapshots(rows: AttributionSnapshotInput[]) {
  const latest = new Map<string, AttributionSnapshotInput>();
  for (const row of rows) {
    const key = `${row.postId}:${row.platform}`;
    const current = latest.get(key);
    if (!current || row.capturedAt > current.capturedAt) latest.set(key, row);
  }
  return latest;
}

function breakdown(
  links: AttributionLinkInput[],
  snapshots: Map<string, AttributionSnapshotInput>,
  conversions: AttributionConversionInput[],
  keyFor: (link: AttributionLinkInput) => string,
): AttributionBreakdown[] {
  const groups = new Map<string, AttributionLinkInput[]>();
  for (const link of links) {
    const key = keyFor(link) || "unknown";
    groups.set(key, [...(groups.get(key) ?? []), link]);
  }
  return [...groups.entries()].map(([key, group]) => {
    const snapshotKeys = new Set(
      group.flatMap((link) => link.postId ? [`${link.postId}:${link.platform}`] : []),
    );
    const impressions = [...snapshotKeys].reduce(
      (sum, snapshotKey) => sum + (snapshots.get(snapshotKey)?.impressions ?? 0),
      0,
    );
    const linkIds = new Set(group.map((link) => link.id));
    const postIds = new Set(group.flatMap((link) => link.postId ? [link.postId] : []));
    const clicks = group.reduce((sum, link) => sum + link.clicksCount, 0);
    const converted = conversions
      .filter((event) =>
        (event.trackedLinkId && linkIds.has(event.trackedLinkId)) ||
        (!event.trackedLinkId && event.postId && postIds.has(event.postId)),
      )
      .reduce((sum, event) => sum + Math.max(0, event.value), 0);
    return {
      key,
      label: key.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      links: group.length,
      impressions,
      clicks,
      clickRate: rate(clicks, impressions),
      conversions: converted,
      conversionRate: rate(converted, clicks),
    };
  }).sort((a, b) => b.clickRate - a.clickRate || b.clicks - a.clicks);
}

export function buildAttributionReport(input: {
  links: AttributionLinkInput[];
  snapshots: AttributionSnapshotInput[];
  conversions: AttributionConversionInput[];
}) {
  const snapshots = latestSnapshots(input.snapshots);
  const linkedSnapshotKeys = new Set(
    input.links.flatMap((link) => link.postId ? [`${link.postId}:${link.platform}`] : []),
  );
  const records = [...linkedSnapshotKeys].flatMap((key) => {
    const record = snapshots.get(key);
    return record ? [record] : [];
  });
  const impressions = records.reduce((sum, row) => sum + row.impressions, 0);
  const engagements = records.reduce(
    (sum, row) => sum + row.likes + row.replies + row.reposts + row.saves + row.linkClicks,
    0,
  );
  const profileVisits = records.reduce((sum, row) => sum + row.profileVisits, 0);
  const followersGained = records.reduce(
    (sum, row) => sum + (row.followersBefore == null || row.followersAfter == null ? 0 : row.followersAfter - row.followersBefore),
    0,
  );
  const clicks = input.links.reduce((sum, link) => sum + link.clicksCount, 0);
  const botHits = input.links.reduce((sum, link) => sum + link.botHits, 0);
  const linkIds = new Set(input.links.map((link) => link.id));
  const postIds = new Set(input.links.flatMap((link) => link.postId ? [link.postId] : []));
  const attributedEvents = input.conversions.filter((event) =>
    (event.trackedLinkId && linkIds.has(event.trackedLinkId)) ||
    (!event.trackedLinkId && event.postId && postIds.has(event.postId)),
  );
  const conversions = attributedEvents.reduce((sum, event) => sum + Math.max(0, event.value), 0);
  const unattributedConversions = input.conversions
    .filter((event) => !attributedEvents.includes(event))
    .reduce((sum, event) => sum + Math.max(0, event.value), 0);
  const byPlatform = breakdown(input.links, snapshots, input.conversions, (link) => link.platform);
  const byStage = breakdown(input.links, snapshots, input.conversions, (link) => link.stage || "isolated_post");
  const byCtaVariant = breakdown(input.links, snapshots, input.conversions, (link) => link.ctaVariant);
  const byPlacement = breakdown(input.links, snapshots, input.conversions, (link) => link.ctaPlacement);
  const byExperiment = breakdown(
    input.links.filter((link) => link.experimentVariant),
    snapshots,
    input.conversions,
    (link) => link.experimentVariant || "unassigned",
  );

  const recommendations: string[] = [];
  if (impressions < 500) recommendations.push("Collect at least 500 linked-post impressions before diagnosing CTA performance.");
  else if (rate(clicks, impressions) < 0.5) recommendations.push("Reach is not turning into clicks. Make the CTA outcome more concrete and verify the destination matches the post promise.");
  if (clicks >= 20 && rate(conversions, clicks) < 5) recommendations.push("Clicks are arriving but conversion is weak. Inspect destination-page message match, load time, and signup friction.");
  if (profileVisits >= 10 && followersGained <= 0) recommendations.push("Profile visits are not producing followers. Align the headline and pinned post with the campaign promise.");
  if (unattributedConversions > 0) recommendations.push(`${unattributedConversions} conversion value is still unattributed. Link future outcomes to a tracked URL or post before comparing campaigns.`);
  const eligibleVariants = byCtaVariant.filter((row) => row.links >= 3 && row.impressions >= 500);
  if (eligibleVariants.length >= 2) {
    const [leader, runnerUp] = eligibleVariants;
    if (leader && runnerUp && leader.clickRate >= runnerUp.clickRate * 1.2) {
      recommendations.push(`${leader.label} leads CTA click rate, but treat it as a candidate only—confirm it with a balanced Phase 5 CTA experiment before applying it.`);
    }
  } else {
    recommendations.push("CTA variants need at least three linked posts and 500 impressions each before a winner can be considered.");
  }

  return {
    funnel: {
      impressions,
      engagements,
      engagementRate: rate(engagements, impressions),
      profileVisits,
      clicks,
      clickRate: rate(clicks, impressions),
      conversions,
      unattributedConversions,
      conversionRate: rate(conversions, clicks),
      followersGained,
      followRate: rate(followersGained, profileVisits),
      botHits,
    },
    byPlatform,
    byStage,
    byCtaVariant,
    byPlacement,
    byExperiment,
    recommendations: recommendations.slice(0, 5),
  };
}
