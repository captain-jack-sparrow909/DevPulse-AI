import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PostActions } from "@/components/post-actions";
import { CopyIconButton } from "@/components/copy-icon-button";
import { parseJsonArray } from "@/lib/utils";
import { format } from "date-fns";
import { resolveDualContent } from "@/lib/content/platforms";
import { PerformanceForm } from "@/components/performance-form";
import { VisualStudio } from "@/components/visual-studio";
import { buildVisualBrief } from "@/lib/visuals/brief";
import { parseVariantConfig } from "@/lib/experiments/definitions";

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireUser();
  const { id } = await params;

  const post = await prisma.post.findFirst({
    where: { id, userId: session.user.id },
    include: {
      schedule: true,
      topic: true,
      writingStyle: true,
      sources: { include: { source: true } },
      readinessJobs: true,
      performanceSnapshots: { orderBy: { capturedAt: "desc" } },
      experimentVariant: { include: { experiment: true } },
      visualAssets: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!post) notFound();
  const visualBrief = buildVisualBrief(post);
  const mediaExperimentVariant = parseVariantConfig(
    post.experimentVariant?.configJson,
  ).mediaType;
  const mediaExperimentPlatform = mediaExperimentVariant
    ? post.experimentVariant?.experiment.platform === "linkedin"
      ? "linkedin"
      : "x"
    : undefined;

  const citations = parseJsonArray<{ title: string; url: string; provider?: string }>(
    post.citationsJson,
  );

  const scores = [
    ["Overall", post.scoreOverall],
    ["Novelty", post.scoreNovelty],
    ["Accuracy", post.scoreAccuracy],
    ["Hook", post.scoreHook],
    ["Readability", post.scoreReadability],
    ["Virality", post.scoreVirality],
    ["Technical", post.scoreTechnical],
    ["Engagement", post.scoreEngagement],
  ] as const;
  let generationSnapshot: Record<string, unknown> | null = null;
  try {
    generationSnapshot = post.generationSnapshotJson
      ? (JSON.parse(post.generationSnapshotJson) as Record<string, unknown>)
      : null;
  } catch {
    generationSnapshot = null;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/posts"
          className="text-xs font-medium text-zinc-500 transition hover:text-teal-300"
        >
          ← Back to posts
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={post.status} />
          <Badge className="border-sky-400/25 bg-sky-400/10 text-sky-200">LinkedIn</Badge>
          <Badge className="border-white/15 bg-white/[0.06] text-zinc-200">X thread</Badge>
          {post.format && <Badge className="text-zinc-400">{post.format}</Badge>}
          {post.angle && (
            <Badge className="border-violet-400/20 bg-violet-400/10 text-violet-200">
              {post.angle}
            </Badge>
          )}
          {post.experimentVariant && (
            <Badge className="border-amber-400/20 bg-amber-400/10 text-amber-200">
              Experiment: {post.experimentVariant.label}{post.experimentEligible ? "" : " · excluded after edit"}
            </Badge>
          )}
          {post.needsImage && (
            <Badge className="border-teal-400/25 bg-teal-400/10 text-teal-200">
              {post.imagePath ? "Has image" : "Image intended"}
            </Badge>
          )}
        </div>
        <div className="mt-3 flex items-start gap-2.5">
          <h1 className="page-title min-w-0 flex-1 break-words">
            {post.title || "Untitled post"}
          </h1>
          <CopyIconButton
            text={post.title || "Untitled post"}
            label="Copy post title"
            className="mt-1"
          />
        </div>
        <p className="page-subtitle">
          Same idea, two formats — long-form for LinkedIn, ≤280 chars per post for X.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>LinkedIn & X copy</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            {(() => {
              const dual = resolveDualContent(post);
              return (
                <PostActions
                  postId={post.id}
                  status={post.status}
                  initialLinkedIn={dual.linkedIn}
                  initialXThread={dual.xThread}
                  imagePath={post.imagePath}
                />
              );
            })()}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Screenshot</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {post.imagePath ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.imagePath}
                    alt={post.imageCaption || "Source screenshot"}
                    className="h-auto w-full max-w-full rounded-lg border border-zinc-800"
                  />
                  <p className="text-xs text-zinc-500">{post.imageCaption}</p>
                  <a
                    href={post.imagePath}
                    download
                    className="inline-block text-sm text-cyan-400 hover:underline"
                  >
                    Download image for upload
                  </a>
                  {post.imageSourceUrl && (
                    <a
                      href={post.imageSourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block text-xs text-zinc-500 hover:text-zinc-300"
                    >
                      Captured from source →
                    </a>
                  )}
                </>
              ) : (
                <p className="text-sm text-zinc-500">
                  {post.imageSkipReason ||
                    "No screenshot for this post (text-only is fine for many angles)."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quality scores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {scores.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-500">{label}</span>
                  <span className="tabular-nums text-zinc-200">
                    {value != null ? value.toFixed(1) : "—"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Meta</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-zinc-400">
              <div>
                Topic:{" "}
                <span className="text-zinc-200">{post.topic?.name || "—"}</span>
              </div>
              <div>
                Style:{" "}
                <span className="text-zinc-200">{post.writingStyle?.name || "—"}</span>
              </div>
              {post.schedule && (
                <div>
                  Ready by:{" "}
                  <span className="text-zinc-200">
                    {format(post.schedule.scheduledFor, "MMM d, yyyy h:mm a")} (slot{" "}
                    {post.schedule.slotIndex + 1})
                  </span>
                </div>
              )}
              {post.postedManuallyAt && (
                <div className="text-violet-300">
                  Marked posted: {format(post.postedManuallyAt, "MMM d, h:mm a")}
                </div>
              )}
              {post.rejectionReason && (
                <div className="text-rose-400">Rejected: {post.rejectionReason}</div>
              )}
              {post.experimentVariant && (
                <div>
                  Experiment:{" "}
                  <Link href="/experiments" className="text-amber-300 hover:underline">
                    {post.experimentVariant.experiment.name} · {post.experimentVariant.label}
                  </Link>
                </div>
              )}
              {generationSnapshot && (
                <div className="rounded-lg border border-white/[0.06] bg-black/20 p-2 text-xs leading-relaxed text-zinc-500">
                  Generation snapshot v{String(generationSnapshot.version ?? 1)} · {String(generationSnapshot.contentType ?? "unknown")} · {String(generationSnapshot.xFormat ?? "default X format")}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sources / citations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {citations.length === 0 && post.sources.length === 0 && (
                <p className="text-sm text-zinc-500">No citations attached.</p>
              )}
              {citations.map((c) => (
                <a
                  key={c.url}
                  href={c.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm text-cyan-400 hover:underline"
                >
                  {c.title}
                </a>
              ))}
              {post.sources.map((ps) => (
                <a
                  key={ps.sourceId}
                  href={ps.source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm text-cyan-400 hover:underline"
                >
                  [{ps.source.provider}] {ps.source.title}
                </a>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visual content studio</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-zinc-500">
            Generate a fact-grounded 4:5 technical card for X or LinkedIn, or a five-page PDF carousel for LinkedIn. Posting remains manual.
          </p>
          <VisualStudio
            postId={post.id}
            brief={{
              title: visualBrief.title,
              subtitle: visualBrief.subtitle,
              bullets: visualBrief.bullets,
              takeaway: visualBrief.takeaway,
              altText: visualBrief.altText,
            }}
            recommendedMedia={{
              x: post.recommendedMediaTypeX,
              linkedin: post.recommendedMediaTypeLinkedIn,
            }}
            currentMedia={{ x: post.mediaTypeX, linkedin: post.mediaTypeLinkedIn }}
            mediaExperimentVariant={mediaExperimentVariant}
            mediaExperimentPlatform={mediaExperimentPlatform}
            assets={post.visualAssets.map((asset) => ({
              id: asset.id,
              kind: asset.kind,
              targetPlatform: asset.targetPlatform,
              status: asset.status,
              filePath: asset.filePath,
              previewPath: asset.previewPath,
              mimeType: asset.mimeType,
              pageCount: asset.pageCount,
              altText: asset.altText,
              error: asset.error,
              createdAt: asset.createdAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Post-performance feedback</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-zinc-500">
            Enter cumulative platform metrics at a consistent age—ideally 24 hours after posting.
            These snapshots power the Analytics recommendations.
          </p>
          <PerformanceForm
            postId={post.id}
            snapshots={post.performanceSnapshots.map((snapshot) => ({
              ...snapshot,
              capturedAt: snapshot.capturedAt.toISOString(),
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
