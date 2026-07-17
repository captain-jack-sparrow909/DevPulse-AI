import Link from "next/link";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import {
  buildPerformanceReport,
  followUpSuggestion,
  type PerformanceBreakdown,
  type PerformanceRecord,
} from "@/lib/analytics/performance";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BulkPerformanceImport } from "@/components/bulk-performance-import";
import { MeasurementDashboard } from "@/components/measurement-dashboard";
import { buildMeasurementQueue, measurementAlerts, measurementCoverage } from "@/lib/measurement/quality";

function BreakdownTable({
  title,
  description,
  rows,
  hour = false,
}: {
  title: string;
  description: string;
  rows: PerformanceBreakdown[];
  hour?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No tracked data yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-zinc-600">
                <tr>
                  <th className="pb-2 font-medium">Group</th>
                  <th className="pb-2 text-right font-medium">Posts</th>
                  <th className="pb-2 text-right font-medium">Impressions</th>
                  <th className="pb-2 text-right font-medium">Engagement</th>
                  <th className="pb-2 text-right font-medium">Followers</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.key} className="border-t border-white/[0.06]">
                    <td className="py-2.5 font-medium text-zinc-200">
                      {hour && row.key !== "unknown" ? `${row.key}:00` : row.label}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-zinc-400">{row.posts}</td>
                    <td className="py-2.5 text-right tabular-nums text-zinc-400">
                      {row.impressions.toLocaleString()}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-teal-300">
                      {row.engagementRate.toFixed(2)}%
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-zinc-400">
                      {row.followersGained >= 0 ? "+" : ""}{row.followersGained}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default async function AnalyticsPage() {
  const session = await requireUser();
  const userId = session.user.id;
  const [snapshots, settings, recentPosted, followerCheckpoints, imports] = await Promise.all([
    prisma.socialPerformanceSnapshot.findMany({
      where: { userId },
      orderBy: { capturedAt: "desc" },
      take: 250,
      include: {
        post: {
          select: {
            title: true,
            hook: true,
            contentType: true,
            angle: true,
            format: true,
            mediaTypeX: true,
            mediaTypeLinkedIn: true,
            postedManuallyAt: true,
            schedule: { select: { scheduledFor: true } },
            sources: {
              select: {
                source: {
                  select: { provider: true, externalId: true, title: true },
                },
              },
            },
          },
        },
      },
    }),
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.post.findMany({
      where: { userId, status: "posted_manually" },
      orderBy: { postedManuallyAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        hook: true,
        postedManuallyAt: true,
        performanceSnapshots: { orderBy: { capturedAt: "asc" } },
      },
    }),
    prisma.followerCheckpoint.findMany({ where: { userId }, orderBy: { capturedAt: "desc" }, take: 30 }),
    prisma.performanceImportRun.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const records = snapshots
    .filter((snapshot) => snapshot.platform === "x" || snapshot.platform === "linkedin")
    .map((snapshot) => ({
      ...snapshot,
      platform: snapshot.platform as "x" | "linkedin",
    })) satisfies PerformanceRecord[];
  const report = buildPerformanceReport(records, settings?.timezone || "Asia/Dubai");
  const measurementPosts = recentPosted.flatMap((post) => post.postedManuallyAt ? [{
    id: post.id,
    label: post.title || post.hook || "Untitled post",
    postedAt: post.postedManuallyAt,
    snapshots: post.performanceSnapshots,
  }] : []);
  const measurementTasks = buildMeasurementQueue(measurementPosts);
  const coverage = measurementCoverage(measurementTasks);
  const alerts = measurementAlerts(measurementPosts);
  const summary = report.summary;
  const stats = [
    ["Tracked posts", summary.trackedPosts.toLocaleString(), `${summary.platformSnapshots} platform records`],
    ["Impressions", summary.impressions.toLocaleString(), "Latest cumulative snapshots"],
    ["Engagement rate", `${summary.engagementRate.toFixed(2)}%`, `${summary.engagements.toLocaleString()} actions`],
    ["Follower change", `${summary.followersGained >= 0 ? "+" : ""}${summary.followersGained}`, `${summary.profileVisits.toLocaleString()} profile visits`],
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Feedback loop"
        title="Performance analytics"
        description="Compare actual platform results—not generation scores—before changing the content strategy."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([label, value, hint]) => (
          <Card key={label} className="stat-card">
            <CardContent className="p-4 sm:p-5">
              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-zinc-500 sm:text-[11px]">
                {label}
              </div>
              <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-zinc-50 sm:text-3xl">
                {value}
              </div>
              <div className="mt-1 text-[11px] text-zinc-600">{hint}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <MeasurementDashboard
        now={new Date().toISOString()}
        coverage={coverage}
        tasks={measurementTasks.map((task) => ({ ...task, dueAt: task.dueAt.toISOString() }))}
        alerts={alerts}
        followerCheckpoints={followerCheckpoints.map((item) => ({
          id: item.id,
          platform: item.platform,
          followers: item.followers,
          profileViews: item.profileViews,
          capturedAt: item.capturedAt.toISOString(),
        }))}
        imports={imports.map((item) => ({
          id: item.id,
          format: item.format,
          rowCount: item.rowCount,
          importedCount: item.importedCount,
          duplicateCount: item.duplicateCount,
          createdAt: item.createdAt.toISOString(),
        }))}
      />

      <Card className="border-teal-500/15 bg-teal-500/[0.03]">
        <CardHeader>
          <CardTitle>Evidence-based next actions</CardTitle>
          <CardDescription>Recommendations remain hypotheses until enough posts repeat the pattern.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.recommendations.map((recommendation, index) => (
            <div key={recommendation} className="flex gap-3 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2.5 text-sm text-zinc-300">
              <Badge className="h-fit border-teal-400/20 bg-teal-400/10 text-teal-200">{index + 1}</Badge>
              <p>{recommendation}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bulk performance import</CardTitle>
          <CardDescription>
            Download a template prefilled with recent posted IDs, enter cumulative X and LinkedIn metrics, then import the CSV in one batch.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BulkPerformanceImport
            posts={recentPosted.map((post) => ({
              id: post.id,
              title: post.title || post.hook || "Untitled post",
            }))}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <BreakdownTable title="By platform" description="X versus LinkedIn using the latest snapshot for each post." rows={report.byPlatform} />
        <BreakdownTable title="By content type" description="Which editorial lane earns interaction and follower growth." rows={report.byContentType} />
        <BreakdownTable title="By product" description="Owned-project fact cards versus external discoveries." rows={report.byProject} />
        <BreakdownTable title="By posting hour" description={`Observed results in ${settings?.timezone || "Asia/Dubai"}.`} rows={report.byPostingHour} hour />
        <BreakdownTable title="By media type" description="Text-only posts versus branded cards, screenshots, and carousels." rows={report.byMediaType} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recently tracked posts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {report.latestRecords.length === 0 && (
            <p className="text-sm text-zinc-500">
              Mark a post as manually published, open it, and enter its X or LinkedIn metrics.
            </p>
          )}
          {report.latestRecords.slice(0, 10).map((record) => (
            <Link key={record.id} href={`/posts/${record.postId}`} className="list-row">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{record.platform === "x" ? "X" : "LinkedIn"}</Badge>
                <span className="text-xs text-zinc-500">
                  {record.impressions.toLocaleString()} impressions · {record.likes} likes · {record.replies} replies
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-zinc-200">
                {record.post.title || record.post.hook || "Tracked post"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                {followUpSuggestion(record)}
              </p>
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
