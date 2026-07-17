import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ArrowRight, CheckCircle2, Clock3, PauseCircle, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildAdaptivePublishingPlan,
  projectKeyFromSource,
  type PublishingPlatform,
} from "@/lib/publishing/adaptive";

function title(post: { title: string | null; hook: string | null; content: string }) {
  return post.title || post.hook || post.content.slice(0, 100);
}

function projectKey(post: {
  sources: Array<{ source: { externalId: string; title: string } }>;
}) {
  for (const link of post.sources) {
    const key = projectKeyFromSource(link.source.externalId, link.source.title);
    if (key) return key;
  }
  return null;
}

function hourLabel(hour: number) {
  const suffix = hour >= 12 ? "PM" : "AM";
  const display = hour % 12 || 12;
  return `${display}:00 ${suffix}`;
}

export default async function PublishingPage() {
  const session = await requireUser();
  const userId = session.user.id;
  const now = new Date();
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const [settings, candidates, workflows, snapshots] = await Promise.all([
    prisma.userSettings.upsert({ where: { userId }, create: { userId }, update: {} }),
    prisma.post.findMany({
      where: {
        userId,
        status: { in: ["pending_review", "approved", "scheduled", "ready"] },
        createdAt: { gte: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000) },
      },
      include: {
        schedule: { select: { scheduledFor: true } },
        sources: { select: { source: { select: { externalId: true, title: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.distributionWorkflow.findMany({
      where: { userId, publishedAt: { gte: cutoff } },
      include: {
        post: {
          select: {
            id: true,
            contentType: true,
            topicId: true,
            sources: { select: { source: { select: { externalId: true, title: true } } } },
          },
        },
      },
      orderBy: { publishedAt: "desc" },
      take: 200,
    }),
    prisma.socialPerformanceSnapshot.findMany({
      where: { userId, capturedAt: { gte: cutoff } },
      include: {
        post: {
          select: {
            postedManuallyAt: true,
            schedule: { select: { scheduledFor: true } },
          },
        },
      },
      orderBy: { capturedAt: "desc" },
      take: 300,
    }),
  ]);

  const latestSnapshots = new Map<string, (typeof snapshots)[number]>();
  for (const snapshot of snapshots) {
    const key = `${snapshot.postId}:${snapshot.platform}`;
    if (!latestSnapshots.has(key)) latestSnapshots.set(key, snapshot);
  }

  const plan = buildAdaptivePublishingPlan({
    now,
    timezone: settings.timezone,
    settings,
    candidates: candidates.map((post) => ({
      id: post.id,
      title: title(post),
      status: post.status,
      createdAt: post.createdAt,
      scheduledFor: post.schedule?.scheduledFor ?? null,
      scoreOverall: post.scoreOverall,
      scoreNovelty: post.scoreNovelty,
      scoreEngagement: post.scoreEngagement,
      scoreHook: post.scoreHook,
      contentType: post.contentType,
      topicId: post.topicId,
      projectKey: projectKey(post),
      hasEvidence: post.sources.length > 0,
      hasX: Boolean(post.threadJson?.trim()),
      hasLinkedIn: Boolean((post.contentLinkedIn || post.content).trim()),
    })),
    publications: workflows
      .filter(
        (workflow): workflow is typeof workflow & { publishedAt: Date } =>
          Boolean(workflow.publishedAt) && ["x", "linkedin"].includes(workflow.platform),
      )
      .map((workflow) => ({
        postId: workflow.postId,
        platform: workflow.platform as PublishingPlatform,
        publishedAt: workflow.publishedAt,
        contentType: workflow.post.contentType,
        topicId: workflow.post.topicId,
        projectKey: projectKey(workflow.post),
      })),
    timingSamples: [...latestSnapshots.values()]
      .filter((snapshot) => ["x", "linkedin"].includes(snapshot.platform))
      .map((snapshot) => {
        const publishedAt = snapshot.post.postedManuallyAt ?? snapshot.post.schedule?.scheduledFor;
        return {
          platform: snapshot.platform as PublishingPlatform,
          hour: publishedAt
            ? Number(formatInTimeZone(publishedAt, settings.timezone, "H"))
            : 0,
          impressions: snapshot.impressions,
          engagements:
            snapshot.likes +
            snapshot.replies +
            snapshot.reposts +
            snapshot.saves +
            snapshot.linkClicks,
        };
      }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Phase 15 · Quality over volume"
        title="Publishing command center"
        description={`Platform-specific cadence, measured timing, and intentional skips · ${settings.timezone}`}
        actions={
          <Link href="/settings">
            <Button variant="secondary">Tune cadence</Button>
          </Link>
        }
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Stat label="Drafts evaluated" value={plan.decisions.length} hint="Last 14 days, unpublished" />
        <Stat label="Passed every gate" value={plan.decisions.filter((item) => item.eligible).length} hint="Evidence + quality + novelty" />
        <Stat label="Intentional skips" value={plan.intentionallySkipped.length} hint="No calendar-filling pressure" />
        <Stat label="Generation cadence" value={settings.adaptiveCadenceEnabled ? settings.xPostsPerDay : settings.postsPerDay} hint="Draft slots per day" />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {plan.lanes.map((lane) => (
          <Card key={lane.platform}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle>{lane.platform === "x" ? "X publishing lane" : "LinkedIn publishing lane"}</CardTitle>
                  <CardDescription>
                    {lane.platform === "x"
                      ? `${lane.alreadyPublished}/${lane.quota} published today`
                      : `${lane.alreadyPublished}/${lane.quota} published this week`}
                  </CardDescription>
                </div>
                <Badge className={lane.activeToday ? "border-teal-400/20 bg-teal-400/10 text-teal-200" : "border-white/10 bg-white/[0.03] text-zinc-400"}>
                  {lane.activeToday ? "Active today" : "Rest day"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.05] p-3">
                <div className="flex items-center gap-2 text-sm font-medium text-cyan-100">
                  <Clock3 className="h-4 w-4" /> Recommended window: {hourLabel(lane.recommendedHour)}
                </div>
                <p className="mt-1 text-xs text-zinc-500">{lane.timingReason}</p>
              </div>

              {lane.skippedReason && lane.selected.length === 0 ? (
                <div className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-zinc-300">
                    <PauseCircle className="h-4 w-4 text-amber-300" /> Publish nothing
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">{lane.skippedReason}</p>
                </div>
              ) : (
                lane.selected.map((decision, index) => (
                  <div key={decision.candidate.id} className="rounded-xl border border-teal-400/20 bg-teal-400/[0.05] p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="border-teal-400/20 bg-teal-400/10 text-teal-200">
                        {index === 0 ? "Best choice" : `Choice ${index + 1}`}
                      </Badge>
                      <Badge>publishing score {decision.score.toFixed(1)}</Badge>
                      {decision.candidate.projectKey && <Badge>{decision.candidate.projectKey}</Badge>}
                    </div>
                    <Link href={`/posts/${decision.candidate.id}`} className="mt-3 block text-sm font-semibold text-zinc-100 hover:text-teal-200">
                      {decision.candidate.title}
                    </Link>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                      Selected because it cleared source evidence, {settings.qualityThreshold.toFixed(1)} quality, {settings.minimumNovelty.toFixed(1)} novelty, and cooldown checks.
                    </p>
                    <Link href={`/posts/${decision.candidate.id}`} className="mt-3 inline-block">
                      <Button size="sm">Review and copy <ArrowRight className="h-3.5 w-3.5" /></Button>
                    </Link>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily engagement sequence</CardTitle>
          <CardDescription>Publishing is one step. Conversation before and after the post creates the growth opportunity.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {[
            ["20 minutes before", "Add 3 specific, useful replies in relevant engineering conversations."],
            ["Publish", "Use the selected platform draft and asset; do not post a gated alternative."],
            ["First 60 minutes", "Answer substantive comments with a detail or focused follow-up question."],
            ["After 24 hours", "Capture comparable metrics before reusing the topic, hook, or product."],
          ].map(([label, copy]) => (
            <div key={label} className="rounded-xl border border-white/[0.07] bg-black/15 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-200">
                <CheckCircle2 className="h-4 w-4 text-violet-300" /> {label}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">{copy}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Why drafts were held back</CardTitle>
          <CardDescription>These are intentional decisions, not generation failures.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {plan.intentionallySkipped.length === 0 ? (
            <p className="text-sm text-zinc-500">No draft is currently blocked by the publishing gates.</p>
          ) : (
            plan.intentionallySkipped.slice(0, 8).map((decision) => (
              <div key={decision.candidate.id} className="rounded-xl border border-white/[0.06] bg-black/15 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Sparkles className="h-4 w-4 text-zinc-500" />
                  <Link href={`/posts/${decision.candidate.id}`} className="text-sm font-medium text-zinc-300 hover:text-teal-200">
                    {decision.candidate.title}
                  </Link>
                  <Badge>score {decision.score.toFixed(1)}</Badge>
                </div>
                <p className="mt-1 text-xs text-zinc-600">{decision.reasons.join(" · ")}</p>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500">{label}</div>
        <div className="mt-2 font-mono text-2xl font-semibold text-zinc-50">{value}</div>
        <div className="mt-1 text-[11px] text-zinc-600">{hint}</div>
      </CardContent>
    </Card>
  );
}
