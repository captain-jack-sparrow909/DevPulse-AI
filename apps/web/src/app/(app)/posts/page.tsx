import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { POST_STATUSES } from "@/lib/constants";
import { formatDistanceToNow } from "date-fns";

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
      <div>
        <h1 className="text-2xl font-semibold text-zinc-50">Post history</h1>
        <p className="mt-1 text-sm text-zinc-400">Search, filter, and open any draft for review.</p>
      </div>

      <form className="flex flex-wrap gap-2">
        <Input name="q" defaultValue={q} placeholder="Search posts…" className="max-w-xs" />
        <select
          name="status"
          defaultValue={status}
          className="h-10 rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 text-sm text-zinc-200"
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
          className="h-10 rounded-lg border border-zinc-700 bg-zinc-950/60 px-3 text-sm text-zinc-200"
        >
          <option value="">All platforms</option>
          <option value="x">X</option>
          <option value="linkedin">LinkedIn</option>
        </select>
        <button
          type="submit"
          className="h-10 rounded-lg bg-zinc-800 px-4 text-sm text-zinc-100 hover:bg-zinc-700"
        >
          Filter
        </button>
      </form>

      <div className="space-y-2">
        {posts.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-zinc-500">
              No posts match. Generate a batch from the Generate page.
            </CardContent>
          </Card>
        )}
        {posts.map((post) => (
          <Link
            key={post.id}
            href={`/posts/${post.id}`}
            className="block rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition hover:border-zinc-700"
          >
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={post.status} />
              <Badge className="border-zinc-700 bg-zinc-800/60 text-zinc-300">
                {post.platform === "x" ? "X" : "LinkedIn"}
              </Badge>
              {post.angle && (
                <Badge className="border-violet-500/20 bg-violet-500/10 text-violet-300">
                  {post.angle}
                </Badge>
              )}
              {post.scoreOverall != null && (
                <span className="text-xs text-zinc-500">{post.scoreOverall.toFixed(1)}/10</span>
              )}
            </div>
            <p className="mt-2 line-clamp-2 text-sm text-zinc-200">
              {post.title || post.content}
            </p>
            <p className="mt-2 text-xs text-zinc-500">
              {formatDistanceToNow(post.createdAt, { addSuffix: true })}
              {post.topic ? ` · ${post.topic.name}` : ""}
              {post.schedule
                ? ` · slot ${post.schedule.slotIndex + 1}`
                : ""}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
