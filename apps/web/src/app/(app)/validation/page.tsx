import { formatInTimeZone } from "date-fns-tz";
import { CheckCircle2, Clock3, Target, TrendingUp } from "lucide-react";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import { ValidationStudyControls } from "@/components/validation-study-controls";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ValidationMetrics, ValidationRecommendation } from "@/lib/validation/study";

function parse<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3"><p className="text-xs text-zinc-500">{label}</p><p className="mt-1 font-mono text-lg text-zinc-100">{value}</p></div>;
}

export default async function ValidationPage() {
  const session = await requireUser();
  const now = new Date();
  const study = await prisma.growthValidationStudy.findFirst({
    where: { userId: session.user.id },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: { checkpoints: { orderBy: { sequence: "asc" } } },
  });

  if (!study) {
    return <div className="space-y-6"><PageHeader title="30-day validation" description="Measure whether adaptive, lower-volume publishing improves engagement and follower growth." /><Card><CardHeader><CardTitle>Start with a real baseline</CardTitle><CardDescription>DevPulse will snapshot the previous 30 days, preserve your current publishing settings, and schedule evidence checkpoints at days 7, 14, 21, and 30.</CardDescription></CardHeader><CardContent><ValidationStudyControls /></CardContent></Card></div>;
  }

  const metrics = parse<ValidationMetrics | null>(study.currentSummaryJson, null);
  const recommendations = parse<ValidationRecommendation[]>(study.recommendationsJson, []);
  const next = study.checkpoints.find((item) => item.status === "pending");
  const elapsed = Math.min(30, Math.max(0, Math.floor((now.getTime() - study.periodStart.getTime()) / 86_400_000)));
  const canCapture = Boolean(next && next.scheduledFor <= now && study.status === "active");

  return (
    <div className="space-y-6">
      <PageHeader title="30-day validation" description="A fixed evidence window for Phase 15's adaptive publishing strategy." />
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{study.name}</CardTitle><CardDescription>{formatInTimeZone(study.periodStart, study.timezone, "d MMM")} – {formatInTimeZone(study.periodEnd, study.timezone, "d MMM yyyy")} · {study.timezone}</CardDescription></div><Badge>{study.status}</Badge></div></CardHeader><CardContent className="space-y-4"><div className="h-2 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-teal-400" style={{ width: `${(elapsed / 30) * 100}%` }} /></div><div className="flex justify-between text-xs text-zinc-500"><span>Day {elapsed} of 30</span><span>{next ? `Next: ${formatInTimeZone(next.scheduledFor, study.timezone, "d MMM, h:mm a")}` : "All checkpoints captured"}</span></div>{study.status === "active" ? <ValidationStudyControls studyId={study.id} canCapture={canCapture} /> : null}</CardContent></Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><Target className="h-4 w-4 text-teal-300" />Decision rules</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-zinc-400"><p>≥80% measurement coverage</p><p>≥5 measured posts per platform</p><p>≥500 impressions before quality tuning</p><p>Only one strategy variable changed at a time</p></CardContent></Card>
      </div>

      {metrics ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Published" value={metrics.totalPublished} /><Metric label="Measurement coverage" value={`${metrics.measurementCoverage}%`} /><Metric label="X engagement" value={`${metrics.x.engagementRate}%`} /><Metric label="LinkedIn engagement" value={`${metrics.linkedin.engagementRate}%`} /></div> : null}

      <Card><CardHeader><CardTitle>Checkpoints</CardTitle><CardDescription>Each capture is persisted, so later recommendations remain auditable.</CardDescription></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-5">{study.checkpoints.map((checkpoint) => <div key={checkpoint.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-3">{checkpoint.status === "captured" ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <Clock3 className="h-4 w-4 text-zinc-500" />}<p className="mt-2 text-sm font-medium text-zinc-200">{checkpoint.label}</p><p className="mt-1 text-xs text-zinc-500">{formatInTimeZone(checkpoint.scheduledFor, study.timezone, "d MMM")}</p><p className="mt-1 text-xs capitalize text-zinc-600">{checkpoint.status}</p></div>)}</div></CardContent></Card>

      <Card><CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-teal-300" />Current recommendations</CardTitle><CardDescription>Advisory only—no threshold, cooldown, or schedule is changed automatically.</CardDescription></CardHeader><CardContent className="space-y-3">{recommendations.length ? recommendations.map((item, index) => <div key={`${item.title}-${index}`} className="rounded-xl border border-white/[0.06] p-4"><div className="flex flex-wrap items-center gap-2"><p className="font-medium text-zinc-100">{item.title}</p><Badge>{item.severity}</Badge></div><p className="mt-2 text-sm leading-6 text-zinc-400">{item.rationale}</p><p className="mt-2 text-sm text-teal-200">Next: {item.action}</p></div>) : <p className="text-sm text-zinc-500">Recommendations appear after the next due checkpoint.</p>}</CardContent></Card>
    </div>
  );
}
