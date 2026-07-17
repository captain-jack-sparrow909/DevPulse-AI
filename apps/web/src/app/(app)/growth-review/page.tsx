import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { WeeklyGrowthReview } from "@/components/weekly-growth-review";

export default async function GrowthReviewPage() {
  const session = await requireUser();
  const reviews = await prisma.weeklyGrowthReview.findMany({
    where: { userId: session.user.id },
    include: { decisions: { orderBy: { priority: "asc" } } },
    orderBy: { periodEnd: "desc" },
    take: 12,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Phase 12 · Growth decision engine"
        title="Weekly growth review"
        description="Compare two measured weeks, diagnose the funnel, and approve exactly three evidence-bounded decisions. Reviews never publish posts or silently change strategy."
      />
      <WeeklyGrowthReview
        reviews={reviews.map((review) => ({
          id: review.id,
          weekKey: review.weekKey,
          status: review.status,
          periodStart: review.periodStart.toISOString(),
          periodEnd: review.periodEnd.toISOString(),
          timezone: review.timezone,
          createdAt: review.createdAt.toISOString(),
          summary: JSON.parse(review.summaryJson),
          evidence: JSON.parse(review.evidenceJson),
          brief: JSON.parse(review.nextWeekBriefJson),
          decisions: review.decisions.map((decision) => ({
            id: decision.id,
            priority: decision.priority,
            category: decision.category,
            title: decision.title,
            rationale: decision.rationale,
            confidence: decision.confidence,
            status: decision.status,
            action: JSON.parse(decision.actionJson),
          })),
        }))}
      />
    </div>
  );
}
