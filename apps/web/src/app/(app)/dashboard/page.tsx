import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { isAiConfigured } from "@/lib/ai/client";
import { formatDistanceToNow } from "date-fns";
import { promoteDuePosts } from "@/lib/schedule/promote-ready";

export default async function DashboardPage() {
  const session = await requireUser();
  const userId = session.user.id;
  await promoteDuePosts(userId);

  const [total, pending, ready, posted, recent, lastJob, sourceCount] = await Promise.all([
    prisma.post.count({ where: { userId } }),
    prisma.post.count({ where: { userId, status: "pending_review" } }),
    prisma.post.count({ where: { userId, status: "ready" } }),
    prisma.post.count({ where: { userId, status: "posted_manually" } }),
    prisma.post.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { schedule: true, topic: true },
    }),
    prisma.generationJob.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.source.count(),
  ]);

  const stats = [
    { label: "Total posts", value: total },
    { label: "Needs review", value: pending },
    { label: "Ready to post", value: ready },
    { label: "Posted (manual)", value: posted },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-400">
            Welcome back, {session.user.name}. One fresh post per due slot — you post manually on X
            &amp; LinkedIn.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/generate">
            <Button>Generate due slot</Button>
          </Link>
          <Link href="/posts?status=ready">
            <Button variant="secondary">Ready queue</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-5">
              <div className="text-xs uppercase tracking-wide text-zinc-500">{s.label}</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums text-zinc-50">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent posts</CardTitle>
            <CardDescription>Latest drafts and scheduled content</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recent.length === 0 && (
              <p className="text-sm text-zinc-500">
                No posts yet. Run a generation job to research trends and draft content.
              </p>
            )}
            {recent.map((post) => (
              <Link
                key={post.id}
                href={`/posts/${post.id}`}
                className="flex items-start justify-between gap-3 rounded-lg border border-zinc-800/80 bg-zinc-950/40 p-3 transition hover:border-zinc-700"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={post.status} />
                    <Badge className="border-zinc-700 bg-zinc-800/50 text-zinc-300">
                      {post.platform === "x" ? "X" : "LinkedIn"}
                    </Badge>
                    {post.scoreOverall != null && (
                      <span className="text-xs text-zinc-500">score {post.scoreOverall.toFixed(1)}</span>
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-sm text-zinc-200">
                    {post.title || post.hook || post.content.slice(0, 80)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                    {post.topic ? ` · ${post.topic.name}` : ""}
                  </p>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System</CardTitle>
              <CardDescription>Runtime configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-zinc-500">AI provider</span>
                <span className={isAiConfigured() ? "text-emerald-400" : "text-amber-400"}>
                  {isAiConfigured() ? "DeepSeek ready" : "Demo mode (no key)"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Sources in DB</span>
                <span className="text-zinc-200">{sourceCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Last job</span>
                <span className="text-zinc-200">{lastJob?.status ?? "—"}</span>
              </div>
              {!isAiConfigured() && (
                <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                  Set <code className="text-amber-100">DEEPSEEK_API_KEY</code> in{" "}
                  <code className="text-amber-100">apps/web/.env</code> for full LLM writing. Without it,
                  research still runs and demo posts are drafted from real sources.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Daily cadence</CardTitle>
              <CardDescription>12 posts · 6:00–21:00 · manual post</CardDescription>
            </CardHeader>
            <CardContent className="text-sm text-zinc-400">
              Cron generates <strong className="text-zinc-200">one post per slot</strong> as each
              time arrives (fresh research every run). Approve, then copy + optional screenshot and
              post yourself. Never auto-posts to X/LinkedIn.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
