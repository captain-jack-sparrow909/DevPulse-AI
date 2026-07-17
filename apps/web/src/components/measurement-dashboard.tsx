"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, Clock3, DatabaseZap, Gauge, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface Props {
  now: string;
  coverage: {
    dueTasks: number;
    completedTasks: number;
    overdueTasks: number;
    missedTasks: number;
    coverage: number;
    due24h: number;
    completed24h: number;
    comparableCoverage: number;
    comparablePosts: number;
    confidence: string;
    byPlatform: Array<{ platform: "x" | "linkedin"; due24h: number; completed24h: number; coverage: number }>;
  };
  tasks: Array<{
    id: string;
    postId: string;
    postLabel: string;
    platform: "x" | "linkedin";
    checkpoint: string;
    dueAt: string;
    status: "upcoming" | "due" | "overdue" | "missed" | "completed";
  }>;
  alerts: Array<{ key: string; severity: "warning" | "error"; message: string; postId: string; platform: string }>;
  followerCheckpoints: Array<{ id: string; platform: string; followers: number; profileViews: number | null; capturedAt: string }>;
  imports: Array<{ id: string; format: string; rowCount: number; importedCount: number; duplicateCount: number; createdAt: string }>;
}

const taskStyle = {
  upcoming: "border-white/10 bg-white/[0.03] text-zinc-400",
  due: "border-teal-400/20 bg-teal-400/10 text-teal-200",
  overdue: "border-rose-400/20 bg-rose-400/10 text-rose-200",
  missed: "border-zinc-400/15 bg-zinc-400/[0.06] text-zinc-400",
  completed: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
};

export function MeasurementDashboard({ now, coverage, tasks, alerts, followerCheckpoints, imports }: Props) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const activeTasks = tasks.filter((task) => ["upcoming", "due", "overdue"].includes(task.status)).slice(0, 24);
  const followerState = (["x", "linkedin"] as const).map((platform) => {
    const rows = followerCheckpoints.filter((item) => item.platform === platform);
    const latest = rows[0] ?? null;
    const previous = rows[1] ?? null;
    return {
      platform,
      latest,
      delta: latest && previous ? latest.followers - previous.followers : null,
      due: !latest || new Date(now).getTime() - new Date(latest.capturedAt).getTime() > 36 * 60 * 60 * 1_000,
    };
  });

  async function saveFollowers(formData: FormData) {
    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/measurement/followers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error || "Could not save follower checkpoint");
      setNotice("Follower checkpoint saved.");
      router.refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not save follower checkpoint");
    } finally {
      setSaving(false);
    }
  }

  const stats = [
    { label: "Capture coverage", value: `${coverage.coverage.toFixed(1)}%`, hint: `${coverage.completedTasks}/${coverage.dueTasks} due checkpoints`, icon: Gauge },
    { label: "Comparable 24h", value: `${coverage.comparableCoverage.toFixed(1)}%`, hint: `${coverage.comparablePosts} measured posts`, icon: Clock3 },
    { label: "Missed windows", value: String(coverage.missedTasks), hint: `${coverage.overdueTasks} still actionable`, icon: AlertTriangle },
    { label: "Review confidence", value: coverage.confidence, hint: "24h coverage gate", icon: DatabaseZap },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return <Card key={stat.label} className="stat-card"><CardContent className="p-4"><div className="flex items-start justify-between gap-2"><p className="text-[10px] uppercase tracking-[0.12em] text-zinc-500">{stat.label}</p><Icon className="h-4 w-4 text-teal-300/80" /></div><p className="mt-2 font-mono text-2xl font-semibold capitalize text-zinc-50">{stat.value}</p><p className="mt-1 text-[11px] text-zinc-600">{stat.hint}</p></CardContent></Card>;
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader><CardTitle>Metric-capture queue</CardTitle><CardDescription>Capture cumulative metrics at 1h, 24h, 72h, and 7d. Weekly decisions use the comparable 24h cohort.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            <div className="mb-3 grid grid-cols-2 gap-2">
              {coverage.byPlatform.map((item) => <div key={item.platform} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"><p className="text-[10px] uppercase tracking-wider text-zinc-600">{item.platform === "x" ? "X" : "LinkedIn"} 24h</p><p className="mt-1 font-mono text-sm text-zinc-200">{item.coverage.toFixed(1)}%</p><p className="text-[10px] text-zinc-600">{item.completed24h}/{item.due24h} captured</p></div>)}
            </div>
            {activeTasks.length === 0 && <div className="rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4 text-sm text-emerald-100"><CheckCircle2 className="mr-2 inline h-4 w-4" />No upcoming or actionable overdue checkpoints for recent posts. Missed historical windows remain in coverage but cannot be backfilled.</div>}
            {activeTasks.map((task) => <Link key={task.id} href={`/posts/${task.postId}#performance`} className="flex flex-col gap-2 rounded-xl border border-white/[0.06] bg-black/20 p-3 hover:border-teal-400/20 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-medium text-zinc-200">{task.postLabel}</p><p className="mt-1 text-xs text-zinc-600">{task.platform === "x" ? "X" : "LinkedIn"} · {task.checkpoint} checkpoint · due {formatDistanceToNow(new Date(task.dueAt), { addSuffix: true })}</p></div><Badge className={taskStyle[task.status]}>{task.status}</Badge></Link>)}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Follower checkpoint</CardTitle><CardDescription>Account-level observations make profile-to-follow conversion measurable.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <form action={saveFollowers} className="space-y-3">
              <select name="platform" className="h-10 w-full rounded-xl border border-white/10 bg-[#0d0f14] px-3 text-sm text-zinc-200 outline-none focus:border-teal-400/40"><option value="x">X</option><option value="linkedin">LinkedIn</option></select>
              <div className="grid grid-cols-2 gap-3"><Input name="followers" type="number" min="0" required placeholder="Followers" /><Input name="profileViews" type="number" min="0" placeholder="Profile views" /></div>
              <Input name="notes" placeholder="Optional context" />
              <Button size="sm" type="submit" disabled={saving}><Users className="h-3.5 w-3.5" />{saving ? "Saving…" : "Save checkpoint"}</Button>
              {notice && <p className="text-xs text-zinc-400">{notice}</p>}
            </form>
            <div className="space-y-2 border-t border-white/[0.06] pt-3">
              {followerState.map((item) => <div key={item.platform} className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2"><div className="flex items-center justify-between"><span className="text-xs text-zinc-500">{item.platform === "x" ? "X" : "LinkedIn"} daily</span><Badge className={item.due ? taskStyle.overdue : taskStyle.completed}>{item.due ? "due" : "current"}</Badge></div><p className="mt-1 font-mono text-sm text-zinc-200">{item.latest ? item.latest.followers.toLocaleString() : "—"}{item.delta != null ? ` (${item.delta >= 0 ? "+" : ""}${item.delta})` : ""}</p></div>)}
              {followerCheckpoints.slice(0, 6).map((item) => <div key={item.id} className="flex items-center justify-between text-xs"><span className="text-zinc-500">{item.platform === "x" ? "X" : "LinkedIn"} · {new Date(item.capturedAt).toLocaleDateString()}</span><span className="font-mono text-zinc-200">{item.followers.toLocaleString()}</span></div>)}
              {!followerCheckpoints.length && <p className="text-xs text-zinc-600">No account checkpoints yet.</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Data-quality alerts</CardTitle><CardDescription>Cumulative regressions, duplicate checkpoints, invalid timing, and incomplete follower pairs</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {!alerts.length && <p className="text-sm text-emerald-200">No snapshot anomalies detected.</p>}
            {alerts.slice(0, 20).map((alert) => <Link key={alert.key} href={`/posts/${alert.postId}#performance`} className={`flex gap-3 rounded-xl border p-3 text-sm ${alert.severity === "error" ? "border-rose-400/15 bg-rose-400/[0.05] text-rose-100" : "border-amber-400/15 bg-amber-400/[0.05] text-amber-100"}`}><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{alert.platform === "x" ? "X" : "LinkedIn"}: {alert.message}</span></Link>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Import audit</CardTitle><CardDescription>Checksums and row keys prevent exact files or snapshot rows from being counted twice</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {!imports.length && <p className="text-sm text-zinc-500">No audited imports yet.</p>}
            {imports.slice(0, 12).map((run) => <div key={run.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3"><div><p className="text-sm font-medium capitalize text-zinc-200">{run.format} CSV</p><p className="mt-1 text-[11px] text-zinc-600">{formatDistanceToNow(new Date(run.createdAt), { addSuffix: true })}</p></div><div className="text-right font-mono text-xs text-zinc-400">{run.importedCount} imported<br />{run.duplicateCount} skipped</div></div>)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
