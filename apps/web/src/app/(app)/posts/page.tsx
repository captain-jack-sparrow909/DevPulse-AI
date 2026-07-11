import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { POST_STATUSES } from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";
import { resolveDualContent } from "@/lib/content/platforms";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; platform?: string }>;
}) {
  const session = await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim() || "";
  const status = sp.status || "";
  const platform = sp.platform || "";

  const posts = await prisma.post.findMany({
    where: {
      userId: session.user.id,
      ...(status ? { status } : {}),
      ...(platform ? { platform } : {}),
      ...(q
        ? {
            OR: [
              { content: { contains: q } },
              { title: { contains: q } },
              { hook: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { topic: true, schedule: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Library"
        title="Post history"
        description="Search, filter, and open any draft for review."
      />

      <Card>
        <CardContent className="p-3 sm:p-4">
          <form className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Input
              name="q"
              defaultValue={q}
              placeholder="Search posts…"
              className="w-full sm:max-w-xs"
            />
            <select
              name="status"
              defaultValue={status}
              className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200 sm:w-auto"
            >
              <option value="">All statuses</option>
              {POST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              name="platform"
              defaultValue={platform}
              className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200 sm:w-auto"
            >
              <option value="">All platforms</option>
              <option value="x">X</option>
              <option value="linkedin">LinkedIn</option>
            </select>
            <button
              type="submit"
              className="h-10 w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 text-sm font-medium text-zinc-100 transition hover:bg-white/[0.1] sm:w-auto"
            >
              Filter
            </button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2.5">
        {posts.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-zinc-400">No posts match.</p>
              <p className="mt-1 text-xs text-zinc-600">Generate a batch from the Generate page.</p>
            </CardContent>
          </Card>
        )}
        {posts.map((post) => {
          const dual = resolveDualContent(post);
          return (
            <Link key={post.id} href={`/posts/${post.id}`} className="list-row">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={post.status} />
                <Badge className="border-sky-400/25 bg-sky-400/10 text-sky-200">LinkedIn</Badge>
                <Badge className="border-white/15 bg-white/[0.06] text-zinc-200">
                  X · {dual.xThread.length} post{dual.xThread.length === 1 ? "" : "s"}
                </Badge>
                {post.angle && (
                  <Badge className="border-violet-400/20 bg-violet-400/10 text-violet-200">
                    {post.angle}
                  </Badge>
                )}
                {post.scoreOverall != null && (
                  <span className="font-mono text-[11px] text-zinc-500">
                    {post.scoreOverall.toFixed(1)}/10
                  </span>
                )}
              </div>
              <p className="mt-2 line-clamp-2 text-sm font-medium text-zinc-100">
                {post.title || dual.linkedIn || post.content}
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <div className="rounded-lg border border-sky-500/15 bg-sky-500/[0.04] px-2.5 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-sky-300/80">
                    LinkedIn preview
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
                    {dual.linkedIn.slice(0, 160) || "—"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                    X preview
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-zinc-400">
                    {dual.xThread[0]?.slice(0, 160) || "—"}
                    {dual.xThread.length > 1 ? ` · +${dual.xThread.length - 1} more` : ""}
                  </p>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-zinc-500">
                {formatDistanceToNow(post.createdAt, { addSuffix: true })}
                {post.topic ? ` · ${post.topic.name}` : ""}
                {post.schedule ? ` · slot ${post.schedule.slotIndex + 1}` : ""}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
