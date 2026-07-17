"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Download,
  FileBarChart,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
  Target,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ReviewData {
  id: string;
  weekKey: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  timezone: string;
  createdAt: string;
  summary: {
    headline: string;
    trackedPosts: number;
    impressions: number;
    engagementRate: number;
    followersGained: number;
    engagementRateDelta: number;
    impressionDeltaPercent: number | null;
    dataConfidence: string;
  };
  evidence: {
    attribution: { impressions: number; clicks: number; conversions: number; clickRate: number };
    experiments: { active: number; winners: number; collecting: number };
    distribution: { assistedPosts: number; baselinePosts: number; assistedEngagementRate: number; baselineEngagementRate: number };
    campaigns: { active: number; tracked: number; impressions: number; bestCampaign: string | null; campaignPosts: number; isolatedPosts: number; campaignEngagementRate: number; isolatedEngagementRate: number };
    operations: { totalRuns: number; successRate: number; failedRuns: number; unhealthyServices: string[] };
  };
  brief: {
    focus: string;
    guardrail: string;
    experiment: string;
    measurement: string[];
    reliabilityNote: string;
  };
  decisions: Array<{
    id: string;
    priority: number;
    category: string;
    title: string;
    rationale: string;
    confidence: string;
    status: string;
    action: { type: string };
  }>;
}

const categoryStyle: Record<string, { icon: typeof ArrowUpRight; className: string; label: string }> = {
  continue: { icon: ArrowUpRight, className: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200", label: "Continue / increase" },
  reduce: { icon: ArrowDownRight, className: "border-amber-400/20 bg-amber-400/10 text-amber-200", label: "Stop / reduce" },
  test: { icon: FlaskConical, className: "border-violet-400/20 bg-violet-400/10 text-violet-200", label: "Test next" },
};

function dateRange(review: ReviewData) {
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: review.timezone };
  return `${new Intl.DateTimeFormat("en", options).format(new Date(review.periodStart))} - ${new Intl.DateTimeFormat("en", { ...options, year: "numeric" }).format(new Date(review.periodEnd))}`;
}

export function WeeklyGrowthReview({ reviews }: { reviews: ReviewData[] }) {
  const router = useRouter();
  const latest = reviews[0] ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function generate() {
    setBusy("generate");
    setNotice(null);
    try {
      const response = await fetch("/api/growth-reviews", { method: "POST" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Review generation failed");
      setNotice("Weekly review generated from the latest evidence.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Review generation failed");
    } finally {
      setBusy(null);
    }
  }

  async function decide(decisionId: string, action: "apply" | "reject") {
    if (!latest) return;
    const key = `${decisionId}:${action}`;
    setBusy(key);
    setNotice(null);
    try {
      const response = await fetch(`/api/growth-reviews/${latest.id}/decisions/${decisionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Decision update failed");
      setNotice(action === "apply" ? "Decision applied. Any mutation is recorded in the review audit trail." : "Decision rejected. No strategy change was made.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Decision update failed");
    } finally {
      setBusy(null);
    }
  }

  if (!latest) {
    return (
      <Card>
        <CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
          <FileBarChart className="h-10 w-10 text-teal-300" />
          <h2 className="mt-4 text-xl font-semibold text-zinc-50">Generate the first weekly review</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-500">DevPulse will compare the last seven days with the preceding seven, then propose exactly three approval-gated decisions. Sparse data produces a collection plan, not invented certainty.</p>
          <Button onClick={generate} disabled={busy === "generate"} className="mt-5"><RefreshCw className={busy === "generate" ? "h-4 w-4 animate-spin" : "h-4 w-4"} />{busy === "generate" ? "Reviewing evidence…" : "Generate weekly review"}</Button>
          {notice && <p className="mt-3 text-sm text-rose-200">{notice}</p>}
        </CardContent>
      </Card>
    );
  }

  const stats = [
    { label: "Tracked posts", value: latest.summary.trackedPosts, hint: `${latest.summary.dataConfidence} confidence` },
    { label: "Impressions", value: latest.summary.impressions.toLocaleString(), hint: latest.summary.impressionDeltaPercent == null ? "No prior baseline" : `${latest.summary.impressionDeltaPercent >= 0 ? "+" : ""}${latest.summary.impressionDeltaPercent}% vs prior` },
    { label: "Engagement", value: `${latest.summary.engagementRate.toFixed(2)}%`, hint: `${latest.summary.engagementRateDelta >= 0 ? "+" : ""}${latest.summary.engagementRateDelta.toFixed(2)} pts` },
    { label: "Followers", value: latest.summary.followersGained >= 0 ? `+${latest.summary.followersGained}` : latest.summary.followersGained, hint: "Recorded deltas only" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-teal-400/15 bg-teal-400/[0.05] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Badge className="border-teal-400/20 bg-teal-400/10 text-teal-100">{latest.status}</Badge><span className="text-xs text-zinc-500">{dateRange(latest)}</span></div>
          <p className="mt-2 text-sm font-medium text-teal-50">{latest.summary.headline}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/growth-reviews/${latest.id}/export?format=pdf`} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-200 hover:bg-white/[0.07]"><Download className="h-3.5 w-3.5" />PDF</a>
          <a href={`/api/growth-reviews/${latest.id}/export?format=csv`} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-200 hover:bg-white/[0.07]"><Download className="h-3.5 w-3.5" />CSV</a>
          <Button size="sm" onClick={generate} disabled={Boolean(busy)}><RefreshCw className={busy === "generate" ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />Today&apos;s review</Button>
        </div>
      </div>
      {notice && <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-300">{notice}</div>}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => <Card key={stat.label} className="stat-card"><CardContent className="p-4"><p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{stat.label}</p><p className="mt-2 font-mono text-2xl font-semibold text-zinc-50">{stat.value}</p><p className="mt-1 text-[11px] text-zinc-600">{stat.hint}</p></CardContent></Card>)}
      </div>

      <div className="space-y-3">
        {latest.decisions.map((decision) => {
          const category = categoryStyle[decision.category] ?? categoryStyle.test;
          const Icon = category.icon;
          return (
            <Card key={decision.id} className="overflow-hidden">
              <CardContent className="p-0">
                <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${category.className}`}><Icon className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><span className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Decision {decision.priority}</span><Badge className={category.className}>{category.label}</Badge><Badge className="border-white/10 bg-white/[0.04] text-zinc-400">{decision.confidence}</Badge><Badge className={decision.status === "applied" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200" : decision.status === "rejected" ? "border-rose-400/20 bg-rose-400/10 text-rose-200" : "border-white/10 bg-white/[0.04] text-zinc-300"}>{decision.status}</Badge></div>
                      <h3 className="mt-2 text-base font-semibold text-zinc-50">{decision.title}</h3>
                      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-zinc-500">{decision.rationale}</p>
                      <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.1em] text-zinc-600">Action: {decision.action.type.replaceAll("_", " ")}</p>
                    </div>
                  </div>
                  {decision.status === "pending" && <div className="flex shrink-0 gap-2 pl-14 lg:pl-0"><Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => decide(decision.id, "reject")}><X className="h-3.5 w-3.5" />Reject</Button><Button size="sm" disabled={Boolean(busy)} onClick={() => decide(decision.id, "apply")}><Check className="h-3.5 w-3.5" />Apply</Button></div>}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Next-week brief</CardTitle><CardDescription>Planning guardrails generated from accepted or pending evidence—not a publishing queue</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {[{ icon: Target, label: "Focus", text: latest.brief.focus }, { icon: ShieldCheck, label: "Guardrail", text: latest.brief.guardrail }, { icon: FlaskConical, label: "Experiment", text: latest.brief.experiment }].map((item) => {
              const Icon = item.icon;
              return <div key={item.label} className="flex gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" /><div><p className="text-xs font-medium text-zinc-300">{item.label}</p><p className="mt-1 text-sm leading-relaxed text-zinc-500">{item.text}</p></div></div>;
            })}
            <p className="pt-1 text-xs leading-relaxed text-zinc-600">{latest.brief.reliabilityNote}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Evidence coverage</CardTitle><CardDescription>The systems consulted for this review</CardDescription></CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3"><p className="text-xs text-zinc-500">Attribution</p><p className="mt-1 font-mono text-lg text-zinc-100">{latest.evidence.attribution.clicks} clicks</p><p className="text-[11px] text-zinc-600">{latest.evidence.attribution.clickRate.toFixed(2)}% CTR · {latest.evidence.attribution.conversions} conversions</p></div>
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3"><p className="text-xs text-zinc-500">Experiments</p><p className="mt-1 font-mono text-lg text-zinc-100">{latest.evidence.experiments.active} active</p><p className="text-[11px] text-zinc-600">{latest.evidence.experiments.winners} winner(s) · {latest.evidence.experiments.collecting} collecting</p></div>
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3"><p className="text-xs text-zinc-500">Distribution</p><p className="mt-1 font-mono text-lg text-zinc-100">{latest.evidence.distribution.assistedPosts} assisted</p><p className="text-[11px] text-zinc-600">{latest.evidence.distribution.assistedEngagementRate.toFixed(2)}% vs {latest.evidence.distribution.baselineEngagementRate.toFixed(2)}% baseline</p></div>
            <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3"><p className="text-xs text-zinc-500">Operations</p><p className="mt-1 font-mono text-lg text-zinc-100">{latest.evidence.operations.successRate.toFixed(1)}%</p><p className="text-[11px] text-zinc-600">{latest.evidence.operations.totalRuns} runs · {latest.evidence.operations.failedRuns} failed</p></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Review history</CardTitle><CardDescription>One immutable evidence snapshot per review day</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {reviews.map((review) => <div key={review.id} className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium text-zinc-200">{review.weekKey} · {review.summary.headline}</p><p className="mt-1 text-xs text-zinc-600">{review.summary.trackedPosts} posts · {review.summary.impressions.toLocaleString()} impressions · {review.summary.engagementRate.toFixed(2)}%</p></div><div className="flex items-center gap-2"><Badge className="border-white/10 bg-white/[0.04] text-zinc-400">{review.status}</Badge><a href={`/api/growth-reviews/${review.id}/export?format=pdf`} className="text-zinc-500 hover:text-teal-200"><ArrowRight className="h-4 w-4" /></a></div></div>)}
        </CardContent>
      </Card>
    </div>
  );
}
