import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { effectivePostsPerDay } from "@/lib/publishing/adaptive";

export default async function SchedulePage() {
  const session = await requireUser();

  const [settings, schedules] = await Promise.all([
    prisma.userSettings.upsert({
      where: { userId: session.user.id },
      create: { userId: session.user.id },
      update: {},
    }),
    prisma.schedule.findMany({
      where: { post: { userId: session.user.id } },
      orderBy: { scheduledFor: "asc" },
      include: { post: true },
      take: 50,
    }),
  ]);
  const dailySlots = effectivePostsPerDay(settings);

  return (
    <div className="space-y-6">
      <div>
        <div className="page-kicker mb-2">Calendar</div>
        <h1 className="page-title">Schedule</h1>
        <p className="page-subtitle">
          {dailySlots} adaptive draft slot{dailySlots === 1 ? "" : "s"} between {settings.firstPostHour}:00 and {settings.lastPostHour}:00. X and LinkedIn publishing recommendations are evaluated independently.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upcoming & recent slots</CardTitle>
          <CardDescription>
            <code className="text-zinc-300">ready</code> = copy &amp; post now;{" "}
            <code className="text-zinc-300">pending</code> still needs review.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {schedules.length === 0 && (
            <p className="text-sm text-zinc-500">No scheduled items. Generate a batch first.</p>
          )}
          {schedules.map((slot) => (
            <Link
              key={slot.id}
              href={`/posts/${slot.postId}`}
              className="list-row flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-cyan-300">
                    {format(slot.scheduledFor, "MMM d · h:mm a")}
                  </span>
                  <Badge className="border-zinc-700 bg-zinc-800/50 text-zinc-400">
                    slot {slot.slotIndex + 1}/{dailySlots}
                  </Badge>
                  <Badge className="border-sky-400/20 bg-sky-400/10 text-sky-200">LinkedIn</Badge>
                  <Badge className="border-white/10 bg-white/[0.04] text-zinc-300">X</Badge>
                  <StatusBadge status={slot.post.status} />
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-zinc-300 sm:truncate sm:line-clamp-none">
                  {slot.post.title || slot.post.content.slice(0, 100)}
                </p>
              </div>
              <span className="text-xs uppercase tracking-wide text-zinc-500">{slot.status}</span>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
