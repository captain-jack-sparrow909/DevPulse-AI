import { requireUser } from "@/lib/session";
import { GeneratePanel } from "@/components/generate-panel";
import { SlotBoard } from "@/components/slot-board";
import { isAiConfigured } from "@/lib/ai/client";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { formatDistanceToNow } from "date-fns";
import { getTodaySlotRows } from "@/lib/schedule/slot-actions";
import { formatSlotDateTime, pickSlotForGeneration } from "@/lib/schedule/slots";

export default async function GeneratePage() {
  const session = await requireUser();
  const userId = session.user.id;
  const { plan, slots } = await getTodaySlotRows(userId);

  const filled = new Set(slots.filter((s) => s.isFilled).map((s) => s.slotIndex));
  const nextMissing = pickSlotForGeneration(plan, filled);

  const jobs = await prisma.generationJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Pipeline"
        title="Generate"
        description={`Auto via cron · manual override only · skip or regenerate · ${plan.timezone}`}
      />

      <GeneratePanel
        aiReady={isAiConfigured()}
        slotSummary={{
          timezone: plan.timezone,
          filledToday: filled.size,
          postsPerDay: plan.postsPerDay,
          nextDueLabel: nextMissing
            ? `Slot ${nextMissing.slotIndex + 1} · ${formatSlotDateTime(nextMissing.scheduledFor, plan.timezone)} · ${nextMissing.mode === "prep_early" ? "prepping" : "due/retry"}`
            : null,
          nextUpcomingLabel:
            plan.nextUpcomingIndex != null && plan.nextUpcomingAt
              ? `Slot ${plan.nextUpcomingIndex + 1} · ${formatSlotDateTime(plan.nextUpcomingAt, plan.timezone)}`
              : null,
        }}
      />

      <SlotBoard
        slots={slots.map((s) => ({
          slotIndex: s.slotIndex,
          scheduledForLabel: formatSlotDateTime(s.scheduledFor, plan.timezone),
          isDue: s.isDue,
          isFilled: s.isFilled,
          isSkipped: s.isSkipped,
          postId: s.postId,
          postStatus: s.postStatus,
          postTitle: s.postTitle,
          platform: s.platform,
          scoreOverall: s.scoreOverall,
        }))}
      />

      <Card>
        <CardHeader>
          <CardTitle>Recent jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {jobs.length === 0 && <p className="text-sm text-zinc-500">No generation jobs yet.</p>}
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-2.5 text-sm"
            >
              <div>
                <span className="font-medium text-zinc-200">{job.status}</span>
                <span className="text-zinc-500">
                  {" "}
                  · {job.producedCount}/{job.targetCount} posts
                </span>
              </div>
              <span className="text-xs text-zinc-500">
                {formatDistanceToNow(job.createdAt, { addSuffix: true })}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
