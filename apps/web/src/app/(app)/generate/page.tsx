import { requireUser } from "@/lib/session";
import { GeneratePanel } from "@/components/generate-panel";
import { isAiConfigured } from "@/lib/ai/client";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";
import { ensureUserDefaults } from "@/lib/ai/pipeline";
import {
  buildSlotPlan,
  dayBoundsUtc,
  formatSlotDateTime,
  pickNextMissingDueSlot,
} from "@/lib/schedule/slots";

export default async function GeneratePage() {
  const session = await requireUser();
  const userId = session.user.id;
  const settings = await ensureUserDefaults(userId);
  const now = new Date();
  const plan = buildSlotPlan(
    now,
    settings.timezone,
    settings.firstPostHour,
    settings.lastPostHour,
    settings.postsPerDay,
  );
  const { start, end } = dayBoundsUtc(now, settings.timezone);
  const todaySchedules = await prisma.schedule.findMany({
    where: {
      scheduledFor: { gte: start, lte: end },
      post: { userId },
      status: { not: "cancelled" },
    },
    select: { slotIndex: true },
  });
  const filled = new Set(todaySchedules.map((s) => s.slotIndex));
  const nextMissing = pickNextMissingDueSlot(plan, filled);

  const jobs = await prisma.generationJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 12,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Generate</h1>
        <p className="mt-1 text-sm text-zinc-400">
          One post per due slot · fresh research each time · {settings.timezone}
        </p>
      </div>

      <GeneratePanel
        aiReady={isAiConfigured()}
        slotSummary={{
          timezone: settings.timezone,
          filledToday: filled.size,
          postsPerDay: settings.postsPerDay,
          nextDueLabel: nextMissing
            ? `Slot ${nextMissing.slotIndex + 1} · ${formatSlotDateTime(nextMissing.scheduledFor, plan.timezone)}`
            : null,
          nextUpcomingLabel:
            plan.nextUpcomingIndex != null && plan.nextUpcomingAt
              ? `Slot ${plan.nextUpcomingIndex + 1} · ${formatSlotDateTime(plan.nextUpcomingAt, plan.timezone)}`
              : null,
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s slot board</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {plan.slots.map((slotAt, i) => {
              const isFilled = filled.has(i);
              const isDue = plan.dueSlotIndexes.includes(i);
              return (
                <div
                  key={i}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    isFilled
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                      : isDue
                        ? "border-amber-500/30 bg-amber-500/10 text-amber-100"
                        : "border-zinc-800 bg-zinc-950/40 text-zinc-400"
                  }`}
                >
                  <div className="font-medium">
                    Slot {i + 1}/{plan.postsPerDay}
                  </div>
                  <div className="text-xs opacity-90">
                    {formatSlotDateTime(slotAt, plan.timezone)}
                  </div>
                  <div className="mt-1 text-xs">
                    {isFilled ? "Generated" : isDue ? "Due — needs generation" : "Upcoming"}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {jobs.length === 0 && <p className="text-sm text-zinc-500">No generation jobs yet.</p>}
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm"
            >
              <div>
                <span className="text-zinc-200">{job.status}</span>
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
