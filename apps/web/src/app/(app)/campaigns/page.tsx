import { requireUser } from "@/lib/session";
import { getContentStrategy } from "@/lib/content/strategy-store";
import { getCampaignViews } from "@/lib/campaigns/service";
import { CAMPAIGN_GOALS } from "@/lib/campaigns/definitions";
import { PageHeader } from "@/components/page-header";
import { CampaignManager } from "@/components/campaign-manager";

export default async function CampaignsPage() {
  const session = await requireUser();
  const [strategy, campaigns] = await Promise.all([
    getContentStrategy(session.user.id),
    getCampaignViews(session.user.id),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        kicker="From isolated posts to a narrative"
        title="Product campaigns"
        description="Plan evidence-backed product stories across X and LinkedIn, review each stage manually, and measure the campaign goal separately from post engagement."
      />
      <CampaignManager
        projects={strategy.projects.map((project) => ({
          id: project.id,
          name: project.name,
          url: project.url,
        }))}
        goals={Object.entries(CAMPAIGN_GOALS).map(([key, goal]) => ({ key, ...goal }))}
        campaigns={campaigns.map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          projectName: campaign.projectName,
          goal: campaign.goal,
          goalMetric: campaign.goalMetric,
          goalTarget: campaign.goalTarget,
          baselineValue: campaign.baselineValue,
          platforms: campaign.platforms,
          status: campaign.status,
          startAt: campaign.startAt.toISOString(),
          endAt: campaign.endAt.toISOString(),
          destinationUrl: campaign.destinationUrl,
          analytics: campaign.analytics,
          items: campaign.items.map((item) => ({
            id: item.id,
            sequence: item.sequence,
            stage: item.stage,
            label: item.label,
            purpose: item.purpose,
            status: item.status,
            scheduledFor: item.scheduledFor.toISOString(),
            evidenceKind: item.evidenceKind,
            blockReason: item.blockReason,
            post: item.post
              ? {
                  id: item.post.id,
                  title: item.post.title || item.post.hook || item.label,
                  status: item.post.status,
                  scoreOverall: item.post.scoreOverall,
                }
              : null,
          })),
        }))}
      />
    </div>
  );
}
