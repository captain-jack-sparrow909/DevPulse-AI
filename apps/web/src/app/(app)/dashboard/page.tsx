import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/page-header";
import { isAiConfigured } from "@/lib/ai/client";
import { formatDistanceToNow } from "date-fns";
import { promoteDuePosts } from "@/lib/schedule/promote-ready";
import { ArrowRight, Clock3, FileText, Sparkles, Zap } from "lucide-react";

export default async function DashboardPage() {
  const session = await requireUser();
  const userId = session.user.id;
  await promoteDuePosts(userId);

  // Sequential-ish batches avoid pool exhaustion on small Supabase free-tier pools
  const [total, pending, ready, posted] = await Promise.all([
    prisma.post.count({ where: { userId } }),
    prisma.post.count({ where: { userId, status: "pending_review" } }),
    prisma.post.count({ where: { userId, status: "ready" } }),
    prisma.post.count({ where: { userId, status: "posted_manually" } }),
  ]);
  const [recent, lastJob, sourceCount] = await Promise.all([
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
    { label: "Total posts", value: total, icon: FileText, hint: "All time" },
    { label: "Needs review", value: pending, icon: Sparkles, hint: "Awaiting you" },
    { label: "Ready to post", value: ready, icon: Zap, hint: "Copy & ship" },
    { label: "Posted", value: posted, icon: Clock3, hint: "Marked manual" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Overview"
        title={`Welcome back, ${session.user.name?.split(" ")[0] || "there"}`}
        description="Research runs in 4 small chunks then a write step (each under Vercel’s 60s). You only approve and post — use Recapture for screenshots."
        actions={
          <>
            <Link href="/posts?status=pending_review" className="w-full sm:w-auto">
              <Button className="w-full sm:w-auto">
                Review queue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/posts?status=ready" className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full sm:w-auto">
                Ready to post
              </Button>
            </Link>
            <Link href="/generate" className="w-full sm:w-auto">
              <Button variant="ghost" className="w-full sm:w-auto text-zinc-400">
                Manual override
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="stat-card">
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500 sm:text-[11px]">
                    {s.label}
                  </div>
                  <div className="rounded-lg border border-white/8 bg-white/[0.03] p-1.5 text-teal-300/80">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                </div>
                <div className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight text-zinc-50 sm:text-3xl">
                  {s.value}
                </div>
                <div className="mt-1 text-[11px] text-zinc-600">{s.hint}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent posts</CardTitle>
            <CardDescription>Latest drafts, reviews, and ready packs</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {recent.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-10 text-center">
                <p className="text-sm text-zinc-400">No posts yet.</p>
                <p className="mt-1 text-xs text-zinc-600">
                  External cron fills each due slot automatically. When a draft appears here, review
                  and post it yourself.
                </p>
                <Link href="/generate" className="mt-4 inline-block">
                  <Button size="sm" variant="secondary">
                    Manual override
                  </Button>
                </Link>
              </div>
            )}
            {recent.map((post) => (
              <Link key={post.id} href={`/posts/${post.id}`} className="list-row">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={post.status} />
                  <Badge className="border-sky-400/20 bg-sky-400/10 text-sky-200">LinkedIn</Badge>
                  <Badge className="border-white/10 bg-white/[0.03] text-zinc-300">X</Badge>
                  {post.scoreOverall != null && (
                    <span className="font-mono text-[11px] text-zinc-500">
                      {post.scoreOverall.toFixed(1)}
                    </span>
                  )}
                </div>
                <p className="mt-2 truncate text-sm font-medium text-zinc-100">
                  {post.title || post.hook || post.content.slice(0, 80)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                  {post.topic ? ` · ${post.topic.name}` : ""}
                </p>
              </Link>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System</CardTitle>
              <CardDescription>Runtime health</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2.5">
                <span className="text-zinc-500">AI provider</span>
                <span
                  className={
                    isAiConfigured()
                      ? "inline-flex items-center gap-1.5 text-emerald-300"
                      : "text-amber-300"
                  }
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${isAiConfigured() ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-amber-400"}`}
                  />
                  {isAiConfigured() ? "DeepSeek ready" : "Demo mode"}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2.5">
                <span className="text-zinc-500">Sources in DB</span>
                <span className="font-mono text-zinc-200">{sourceCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.05] bg-black/20 px-3 py-2.5">
                <span className="text-zinc-500">Last job</span>
                <span className="text-zinc-200">{lastJob?.status ?? "—"}</span>
              </div>
              {!isAiConfigured() && (
                <p className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-100/90">
                  Set <code className="text-amber-50">DEEPSEEK_API_KEY</code> for full LLM writing.
                  Research still runs without it.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-white/[0.05] bg-gradient-to-br from-teal-500/[0.08] to-transparent px-5 py-4">
              <CardTitle>Daily cadence</CardTitle>
              <CardDescription className="mt-1">12 slots · 06:00–21:00 · Asia/Dubai</CardDescription>
            </div>
            <CardContent className="text-sm leading-relaxed text-zinc-400">
              Cron generates <span className="text-zinc-200">one post for the current due slot</span>{" "}
              with fresh research. Missed earlier slots are auto-skipped (no backfill spillover).
              Approve, copy text + screenshot, post yourself — never auto-published.
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
