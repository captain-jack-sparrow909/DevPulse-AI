"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  CalendarCheck2,
  Check,
  CircleDot,
  Clock3,
  Download,
  ExternalLink,
  FlaskConical,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  SkipForward,
  Target,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface ExecutionItemData {
  id: string;
  sequence: number;
  scheduledFor: string;
  slotIndex: number;
  contentType: string;
  projectName: string | null;
  objective: string;
  angle: string;
  platforms: string;
  mediaType: string;
  cta: { mode?: string; destinationUrl?: string | null; source?: string };
  distribution: { preEngage?: boolean; reviewCommentsWithinHours?: number; captureAudienceSignal?: boolean };
  measurement: { checkpoints?: string[]; primaryCheckpoint?: string; requireFollowers?: boolean };
  experimentId: string | null;
  campaignId: string | null;
  status: string;
  post: { id: string; status: string; postedManuallyAt: string | null; snapshotTimes: string[] } | null;
}

interface ExecutionPlanData {
  id: string;
  weekKey: string;
  timezone: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  approvedAt: string | null;
  createdAt: string;
  brief: { focus: string; guardrail: string; experiment: string; operatingRules: string[] };
  review: { id: string; status: string; weekKey: string };
  items: ExecutionItemData[];
}

const statusClass: Record<string, string> = {
  proposed: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  approved: "border-teal-400/20 bg-teal-400/10 text-teal-200",
  rejected: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  drafted: "border-violet-400/20 bg-violet-400/10 text-violet-200",
  published: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  measured: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  skipped: "border-white/10 bg-white/[0.04] text-zinc-500",
};

function title(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string, timezone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en", { timeZone: timezone, ...options }).format(new Date(value));
}

export function ExecutionPlanner({ plans }: { plans: ExecutionPlanData[] }) {
  const router = useRouter();
  const latest = plans[0] ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function request(url: string, body: Record<string, string>, key: string, success: string) {
    setBusy(key);
    setNotice(null);
    try {
      const response = await fetch(url, {
        method: url === "/api/execution-plans" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Execution plan update failed");
      setNotice(success);
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Execution plan update failed");
    } finally {
      setBusy(null);
    }
  }

  if (!latest) {
    return (
      <Card>
        <CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center">
          <CalendarCheck2 className="h-10 w-10 text-teal-300" />
          <h2 className="mt-4 text-xl font-semibold text-zinc-50">Build the first seven-day plan</h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-500">The latest weekly review becomes one anchor brief per day. Creating a plan does not alter the schedule, generate a post, or publish content.</p>
          <Button className="mt-5" disabled={busy === "create"} onClick={() => request("/api/execution-plans", {}, "create", "Draft plan created. Review each anchor before approval.")}>
            <RefreshCw className={busy === "create" ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
            {busy === "create" ? "Building plan…" : "Create from latest review"}
          </Button>
          {notice && <p className="mt-3 text-sm text-rose-200">{notice}</p>}
        </CardContent>
      </Card>
    );
  }

  const terminal = latest.items.every((item) => ["rejected", "measured", "skipped"].includes(item.status));
  const activeCount = latest.items.filter((item) => item.status !== "rejected").length;
  const measuredCount = latest.items.filter((item) => item.status === "measured").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-teal-400/15 bg-teal-400/[0.05] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge className={latest.status === "approved" ? statusClass.approved : "border-white/10 bg-white/[0.04] text-zinc-300"}>{latest.status}</Badge>
            <span className="text-xs text-zinc-500">
              {formatDate(latest.periodStart, latest.timezone, { month: "short", day: "numeric" })} – {formatDate(latest.periodEnd, latest.timezone, { month: "short", day: "numeric", year: "numeric" })} · {latest.timezone}
            </span>
          </div>
          <p className="mt-2 text-sm font-medium text-teal-50">{activeCount} anchor posts · {measuredCount} measured · source review {latest.review.status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/api/execution-plans/${latest.id}/export`} className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-200 hover:bg-white/[0.07]"><Download className="h-3.5 w-3.5" />Calendar</a>
          {latest.status === "draft" && <Button size="sm" disabled={Boolean(busy)} onClick={() => request(`/api/execution-plans/${latest.id}`, { action: "approve" }, "approve", "Plan approved. Matching generation slots may now use these anchors; every draft still requires review.")}><Check className="h-3.5 w-3.5" />Approve plan</Button>}
          {latest.status === "approved" && terminal && <Button size="sm" disabled={Boolean(busy)} onClick={() => request(`/api/execution-plans/${latest.id}`, { action: "complete" }, "complete", "Execution plan completed.")}><Check className="h-3.5 w-3.5" />Complete</Button>}
          {!["completed", "cancelled"].includes(latest.status) && <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => request(`/api/execution-plans/${latest.id}`, { action: "cancel" }, "cancel", "Plan cancelled. It will no longer guide generation.")}><X className="h-3.5 w-3.5" />Cancel</Button>}
        </div>
      </div>

      {latest.status === "draft" && latest.review.status !== "reviewed" && (
        <div className="rounded-xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-sm text-amber-100">
          Approval is locked until all three source decisions are applied or rejected. <Link href="/growth-review" className="font-medium underline underline-offset-4">Finish the weekly review</Link>.
        </div>
      )}
      {notice && <div className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-zinc-300">{notice}</div>}

      <div className="grid gap-3 lg:grid-cols-3">
        {[
          { icon: Target, label: "Weekly focus", text: latest.brief.focus },
          { icon: ShieldCheck, label: "Guardrail", text: latest.brief.guardrail },
          { icon: FlaskConical, label: "Experiment", text: latest.brief.experiment },
        ].map((item) => {
          const Icon = item.icon;
          return <Card key={item.label}><CardContent className="flex gap-3 p-4"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" /><div><p className="text-xs font-medium text-zinc-300">{item.label}</p><p className="mt-1 text-sm leading-relaxed text-zinc-500">{item.text}</p></div></CardContent></Card>;
        })}
      </div>

      <div className="space-y-3">
        {latest.items.map((item) => {
          const disabled = item.status === "rejected" || item.status === "skipped";
          return (
            <Card key={item.id} className={disabled ? "opacity-60" : ""}>
              <CardContent className="p-0">
                <div className="flex flex-col gap-4 p-5 xl:flex-row xl:items-start xl:justify-between">
                  <div className="flex min-w-0 gap-4">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-teal-400/15 bg-teal-400/[0.06]">
                      <span className="text-[9px] uppercase tracking-wider text-zinc-500">{formatDate(item.scheduledFor, latest.timezone, { weekday: "short" })}</span>
                      <span className="font-mono text-lg font-semibold text-teal-100">{formatDate(item.scheduledFor, latest.timezone, { day: "2-digit" })}</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={statusClass[item.status] ?? statusClass.skipped}>{item.status}</Badge>
                        <Badge className="border-white/10 bg-white/[0.04] text-zinc-400">{title(item.contentType)}</Badge>
                        {item.projectName && <Badge className="border-teal-400/15 bg-teal-400/[0.06] text-teal-200">{item.projectName}</Badge>}
                        {item.experimentId && <Badge className="border-violet-400/15 bg-violet-400/[0.06] text-violet-200">experiment</Badge>}
                        {item.campaignId && <Badge className="border-amber-400/15 bg-amber-400/[0.06] text-amber-200">campaign</Badge>}
                      </div>
                      <h3 className="mt-2 text-base font-semibold text-zinc-50">{item.objective}</h3>
                      <p className="mt-1 max-w-3xl text-sm leading-relaxed text-zinc-500">{item.angle}</p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-zinc-600">
                        <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />{formatDate(item.scheduledFor, latest.timezone, { hour: "numeric", minute: "2-digit" })} · slot {item.slotIndex + 1}</span>
                        <span>{item.platforms.replaceAll(",", " + ")}</span>
                        <span>{title(item.mediaType)}</span>
                        <span>CTA: {title(item.cta.mode || "review")}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-zinc-500">
                        {item.distribution.preEngage && <span className="rounded-full border border-white/[0.06] px-2 py-1">pre-engage</span>}
                        {item.distribution.reviewCommentsWithinHours && <span className="rounded-full border border-white/[0.06] px-2 py-1">comments ≤ {item.distribution.reviewCommentsWithinHours}h</span>}
                        {item.measurement.checkpoints?.map((checkpoint) => <span key={checkpoint} className="rounded-full border border-white/[0.06] px-2 py-1">measure {checkpoint}</span>)}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 pl-16 xl:pl-0">
                    {latest.status === "draft" && item.status === "proposed" && <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => request(`/api/execution-plans/${latest.id}/items/${item.id}`, { action: "reject" }, `reject:${item.id}`, "Anchor removed from the draft plan.")}><X className="h-3.5 w-3.5" />Reject</Button>}
                    {latest.status === "draft" && item.status === "rejected" && <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => request(`/api/execution-plans/${latest.id}/items/${item.id}`, { action: "restore" }, `restore:${item.id}`, "Anchor restored to the draft plan.")}><RefreshCw className="h-3.5 w-3.5" />Restore</Button>}
                    {latest.status === "approved" && ["approved", "drafted"].includes(item.status) && <Button size="sm" variant="secondary" disabled={Boolean(busy)} onClick={() => request(`/api/execution-plans/${latest.id}/items/${item.id}`, { action: "skip" }, `skip:${item.id}`, "Anchor skipped; it will no longer guide generation.")}><SkipForward className="h-3.5 w-3.5" />Skip</Button>}
                    {item.post && <Link href={`/posts/${item.post.id}`} className="inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-zinc-100 transition hover:border-white/15 hover:bg-white/[0.07]">Open draft<ExternalLink className="h-3.5 w-3.5" /></Link>}
                    {latest.status === "approved" && item.status === "drafted" && item.post?.status === "posted_manually" && <Button size="sm" disabled={Boolean(busy)} onClick={() => request(`/api/execution-plans/${latest.id}/items/${item.id}`, { action: "published" }, `published:${item.id}`, "Anchor marked published. Capture the 24-hour checkpoint next.")}><Check className="h-3.5 w-3.5" />Confirm published</Button>}
                    {latest.status === "approved" && item.status === "published" && <Button size="sm" disabled={Boolean(busy)} onClick={() => request(`/api/execution-plans/${latest.id}/items/${item.id}`, { action: "measured" }, `measured:${item.id}`, "Valid 24-hour measurement confirmed.")}><CircleDot className="h-3.5 w-3.5" />Confirm 24h</Button>}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Operating rules</CardTitle><CardDescription>Hard boundaries preserved after plan approval</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {latest.brief.operatingRules.map((rule) => <div key={rule} className="flex gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3"><ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" /><p className="text-sm leading-relaxed text-zinc-500">{rule}</p></div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Plan history</CardTitle><CardDescription>Latest persisted execution windows and their approval state</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {plans.map((plan) => <div key={plan.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3"><div><p className="text-sm font-medium text-zinc-200">Week of {formatDate(plan.periodStart, plan.timezone, { month: "short", day: "numeric", year: "numeric" })}</p><p className="mt-1 text-xs text-zinc-600">{plan.items.filter((item) => item.status !== "rejected").length} anchors · review {plan.review.weekKey}</p></div><Badge className={plan.status === "approved" ? statusClass.approved : "border-white/10 bg-white/[0.04] text-zinc-400"}>{plan.status}</Badge></div>)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
