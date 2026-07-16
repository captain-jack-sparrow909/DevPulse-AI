import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { AttributionDashboard } from "@/components/attribution-dashboard";
import { buildAttributionReport } from "@/lib/attribution/report";
import { trackedLinkUrl } from "@/lib/attribution/links";

export default async function AttributionPage() {
  const session = await requireUser();
  const userId = session.user.id;
  const [links, snapshots, conversions, posts] = await Promise.all([
    prisma.trackedLink.findMany({
      where: { userId },
      include: {
        post: { select: { title: true, hook: true, status: true } },
        campaign: { select: { name: true } },
        campaignItem: { select: { stage: true, label: true } },
        experimentVariant: {
          select: { label: true, experiment: { select: { name: true, dimension: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    prisma.socialPerformanceSnapshot.findMany({
      where: { userId },
      orderBy: { capturedAt: "desc" },
      take: 500,
    }),
    prisma.conversionEvent.findMany({
      where: { userId },
      orderBy: { occurredAt: "desc" },
      take: 500,
    }),
    prisma.post.findMany({
      where: { userId, status: { notIn: ["skipped", "rejected", "failed"] } },
      select: {
        id: true,
        title: true,
        hook: true,
        platform: true,
        campaignItem: {
          select: { label: true, campaign: { select: { name: true, destinationUrl: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
  ]);
  const report = buildAttributionReport({
    links: links.map((link) => ({
      id: link.id,
      platform: link.platform,
      postId: link.postId,
      clicksCount: link.clicksCount,
      botHits: link.botHits,
      ctaVariant: link.ctaVariant,
      ctaPlacement: link.ctaPlacement,
      stage: link.campaignItem?.stage ?? null,
      experimentVariant: link.experimentVariant
        ? `${link.experimentVariant.experiment.name} · ${link.experimentVariant.label}`
        : null,
    })),
    snapshots,
    conversions,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Attention is not the outcome"
        title="Attribution and conversion"
        description="Connect impressions to aggregate clicks and explicit product outcomes without cookies, visitor profiles, IP storage, or automatic conversion claims."
      />
      <AttributionDashboard
        report={report}
        posts={posts.map((post) => ({
          id: post.id,
          label: post.title || post.hook || "Untitled post",
          platform: post.platform,
          campaignLabel: post.campaignItem
            ? `${post.campaignItem.campaign.name} · ${post.campaignItem.label}`
            : null,
          defaultDestination: post.campaignItem?.campaign.destinationUrl ?? null,
        }))}
        links={links.map((link) => ({
          id: link.id,
          label: link.label,
          platform: link.platform,
          status: link.status,
          trackedUrl: trackedLinkUrl(link.slug),
          destinationUrl: link.destinationUrl,
          clicksCount: link.clicksCount,
          botHits: link.botHits,
          ctaVariant: link.ctaVariant,
          ctaPlacement: link.ctaPlacement,
          postLabel: link.post?.title || link.post?.hook || null,
          campaignLabel: link.campaign?.name || null,
          stageLabel: link.campaignItem?.label || null,
          experimentLabel: link.experimentVariant
            ? `${link.experimentVariant.experiment.name} · ${link.experimentVariant.label}`
            : null,
          createdAt: link.createdAt.toISOString(),
        }))}
        conversions={conversions.slice(0, 30).map((event) => ({
          id: event.id,
          eventType: event.eventType,
          value: event.value,
          source: event.source,
          platform: event.platform,
          occurredAt: event.occurredAt.toISOString(),
          trackedLinkId: event.trackedLinkId,
        }))}
      />
    </div>
  );
}
