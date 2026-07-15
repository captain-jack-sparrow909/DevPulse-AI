import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EngagementOpportunities } from "@/components/engagement-opportunities";

export default async function EngagementPage() {
  const session = await requireUser();
  const opportunities = await prisma.engagementOpportunity.findMany({
    where: { userId: session.user.id },
    orderBy: [{ status: "asc" }, { discoveredAt: "desc" }],
    take: 100,
  });
  const xReady = Boolean(
    process.env.X_BEARER_TOKEN?.trim() || process.env.TWITTER_BEARER_TOKEN?.trim(),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Distribution"
        title="Engagement opportunities"
        description="Join relevant engineering conversations manually. This feed is separate from post generation and never publishes for you."
      />
      <Card className="border-violet-500/15 bg-violet-500/[0.03]">
        <CardHeader>
          <CardTitle>Reply standard</CardTitle>
          <CardDescription>Useful replies earn profile visits more reliably than dropping product links.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-zinc-400 sm:grid-cols-3">
          <p>1. Address one specific technical point.</p>
          <p>2. Add a verified lesson or a focused question.</p>
          <p>3. Mention a product only when it directly answers the thread.</p>
        </CardContent>
      </Card>
      <EngagementOpportunities
        xReady={xReady}
        opportunities={opportunities.map((opportunity) => ({
          ...opportunity,
          discoveredAt: opportunity.discoveredAt.toISOString(),
        }))}
      />
    </div>
  );
}

