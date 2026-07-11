import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

export default async function SchedulePage() {
  const session = await requireUser();

  const schedules = await prisma.schedule.findMany({
    where: { post: { userId: session.user.id } },
    orderBy: { scheduledFor: "asc" },
    include: {
      post: true,
    },
    take: 50,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Schedule</h1>
        <p className="mt-1 text-sm text-zinc-400">
          12 daily slots from 6:00 to 21:00. When a slot is due, the post becomes ready for you to post manually.
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
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 px-4 py-3 transition hover:border-zinc-700"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-sm text-cyan-300">
                    {format(slot.scheduledFor, "MMM d · h:mm a")}
                  </span>
                  <Badge className="border-zinc-700 bg-zinc-800/50 text-zinc-400">
                    slot {slot.slotIndex + 1}/12
                  </Badge>
                  <Badge className="border-zinc-700 bg-zinc-800/50 text-zinc-300">
                    {slot.post.platform === "x" ? "X" : "LinkedIn"}
                  </Badge>
                  <StatusBadge status={slot.post.status} />
                </div>
                <p className="mt-1 truncate text-sm text-zinc-300">
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
