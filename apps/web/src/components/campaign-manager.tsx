"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ExternalLink,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface ProjectView { id: string; name: string; url: string }
interface GoalView { key: string; label: string; metric: string; ctaMode: string; description: string }
interface CampaignItemView {
  id: string;
  sequence: number;
  stage: string;
  label: string;
  purpose: string;
  status: string;
  scheduledFor: string;
  evidenceKind: string;
  blockReason: string | null;
  post: { id: string; title: string; status: string; scoreOverall: number | null } | null;
}
interface CampaignView {
  id: string;
  name: string;
  projectName: string;
  goal: string;
  goalMetric: string;
  goalTarget: number | null;
  baselineValue: number | null;
  platforms: string;
  status: string;
  startAt: string;
  endAt: string;
  destinationUrl: string | null;
  analytics: {
    trackedPlatforms: number;
    impressions: number;
    engagementRate: number;
    followersGained: number;
    goalValue: number | null;
    goalDelta: number;
    goalProgress: number | null;
    baselineTrackedPlatforms: number;
    baselineEngagementRate: number;
  };
  items: CampaignItemView[];
}

function isoDate(offsetDays: number) {
  const date = new Date(Date.now() + offsetDays * 86_400_000);
  return date.toISOString().slice(0, 10);
}

export function CampaignManager({ projects, goals, campaigns }: {
  projects: ProjectView[];
  goals: GoalView[];
  campaigns: CampaignView[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(campaigns[0]?.id ?? null);
  const [metricValues, setMetricValues] = useState<Record<string, string>>({});

  async function call(url: string, init: RequestInit, key: string) {
    setBusy(key);
    setMessage("");
    setError("");
    try {
      const response = await fetch(url, init);
      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Request failed");
      router.refresh();
      return data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Request failed");
      return null;
    } finally {
      setBusy("");
    }
  }

  async function create(formData: FormData) {
    const input = Object.fromEntries(formData.entries());
    const result = await call(
      "/api/campaigns",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
      "create",
    );
    if (result) {
      const campaign = result.campaign as { id?: string } | undefined;
      if (campaign?.id) setExpanded(campaign.id);
      setMessage("Campaign planned. Blocked stages show exactly which evidence is still required.");
    }
  }

  async function campaignAction(id: string, action: string) {
    const result = await call(
      `/api/campaigns/${id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) },
      `campaign:${id}:${action}`,
    );
    if (result) setMessage(action === "refresh_evidence" ? "Campaign evidence refreshed." : `Campaign ${action}d.`);
  }

  async function itemAction(campaignId: string, itemId: string, action: string) {
    const result = await call(
      `/api/campaigns/${campaignId}/items/${itemId}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) },
      `item:${itemId}:${action}`,
    );
    if (result) setMessage("Campaign timeline updated.");
  }

  async function draft(campaignId: string, itemId: string) {
    const result = await call(
      `/api/campaigns/${campaignId}/items/${itemId}/draft`,
      { method: "POST" },
      `draft:${itemId}`,
    );
    if (result) setMessage("Campaign post drafted. Open it to review, edit, and approve manually.");
  }

  async function recordMetric(campaign: CampaignView) {
    const value = metricValues[campaign.id];
    if (!value) return;
    const result = await call(
      `/api/campaigns/${campaign.id}/metrics`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metric: campaign.goalMetric, value }) },
      `metric:${campaign.id}`,
    );
    if (result) {
      setMetricValues((current) => ({ ...current, [campaign.id]: "" }));
      setMessage("Campaign goal metric recorded.");
    }
  }

  return (
    <div className="space-y-6">
      {(message || error) && <div className={`rounded-xl border px-3 py-2 text-sm ${error ? "border-rose-400/20 bg-rose-400/[0.06] text-rose-200" : "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200"}`}>{error || message}</div>}

      <Card>
        <CardHeader><CardTitle>Plan a campaign</CardTitle><CardDescription>Seven narrative stages across 3–30 days. Missing facts remain visibly blocked instead of being invented.</CardDescription></CardHeader>
        <CardContent>
          <form action={create} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <Input name="name" required placeholder="Campaign name" />
              <select name="projectId" required className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200">{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select>
              <select name="goal" required className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200">{goals.map((goal) => <option key={goal.key} value={goal.key}>{goal.label}</option>)}</select>
              <select name="platforms" className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200"><option value="x,linkedin">X + LinkedIn</option><option value="x">X only</option><option value="linkedin">LinkedIn only</option></select>
              <label className="space-y-1 text-xs text-zinc-500">Start<Input name="startAt" type="date" defaultValue={isoDate(1)} required /></label>
              <label className="space-y-1 text-xs text-zinc-500">End<Input name="endAt" type="date" defaultValue={isoDate(7)} required /></label>
              <Input name="baselineValue" type="number" min="0" placeholder="Goal baseline (optional)" />
              <Input name="goalTarget" type="number" min="0" placeholder="Goal target (optional)" />
            </div>
            <div className="grid gap-3 lg:grid-cols-3"><Input name="destinationUrl" type="url" placeholder="Repository, product, or waitlist URL" /><Input name="ctaTextX" placeholder="Final X CTA (optional)" /><Input name="ctaTextLinkedIn" placeholder="Final LinkedIn CTA (optional)" /></div>
            <Textarea name="notes" placeholder="Campaign constraints or notes (optional)" />
            <Button type="submit" disabled={Boolean(busy)}>{busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />} Plan campaign</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-5">
        {campaigns.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-zinc-500">No campaigns yet. Start with one product and one measurable goal.</div>}
        {campaigns.map((campaign) => {
          const ready = campaign.items.filter((item) => item.status === "planned").length;
          const blocked = campaign.items.filter((item) => item.status === "blocked").length;
          const drafted = campaign.items.filter((item) => item.post).length;
          const isExpanded = expanded === campaign.id;
          return <Card key={campaign.id}>
            <CardHeader className="gap-4 sm:flex-row sm:items-start sm:justify-between">
              <button type="button" className="min-w-0 text-left" onClick={() => setExpanded(isExpanded ? null : campaign.id)}>
                <div className="flex flex-wrap items-center gap-2"><CardTitle>{campaign.name}</CardTitle><Badge>{campaign.projectName}</Badge><Badge>{campaign.status}</Badge></div>
                <CardDescription className="mt-1">{campaign.goal.replaceAll("_", " ")} · {campaign.platforms.replace(",", " + ")} · {new Date(campaign.startAt).toLocaleDateString()}–{new Date(campaign.endAt).toLocaleDateString()}</CardDescription>
              </button>
              <div className="flex flex-wrap gap-2">
                {campaign.status !== "active" && campaign.status !== "completed" && <Button size="sm" onClick={() => campaignAction(campaign.id, "activate")} disabled={Boolean(busy)}><Play className="h-3.5 w-3.5" /> Activate</Button>}
                {campaign.status === "active" && <Button size="sm" variant="secondary" onClick={() => campaignAction(campaign.id, "pause")} disabled={Boolean(busy)}><Pause className="h-3.5 w-3.5" /> Pause</Button>}
                {campaign.status !== "completed" && <Button size="sm" variant="ghost" onClick={() => campaignAction(campaign.id, "complete")} disabled={Boolean(busy)}>Complete</Button>}
                <Button size="sm" variant="outline" onClick={() => campaignAction(campaign.id, "refresh_evidence")} disabled={Boolean(busy)}><RefreshCw className="h-3.5 w-3.5" /> Refresh evidence</Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                <Metric label="Drafted" value={`${drafted}/7`} /><Metric label="Ready" value={String(ready)} /><Metric label="Blocked" value={String(blocked)} /><Metric label="Campaign / baseline" value={`${campaign.analytics.engagementRate.toFixed(2)}% / ${campaign.analytics.baselineEngagementRate.toFixed(2)}%`} /><Metric label="Goal progress" value={campaign.analytics.goalProgress == null ? "—" : `${campaign.analytics.goalProgress}%`} />
              </div>
              {campaign.analytics.goalProgress != null && <div className="h-2 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full bg-teal-400" style={{ width: `${campaign.analytics.goalProgress}%` }} /></div>}
              {isExpanded && <>
                <div className="space-y-3">
                  {campaign.items.map((item, index) => <div key={item.id} className={`rounded-xl border p-4 ${item.status === "blocked" ? "border-amber-400/15 bg-amber-400/[0.03]" : "border-white/[0.07] bg-black/15"}`}>
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge>{item.sequence}/7</Badge><span className="text-sm font-medium text-zinc-100">{item.label}</span><Badge>{item.evidenceKind.replaceAll("_", " ")}</Badge><Badge>{item.post?.status || item.status}</Badge></div><p className="mt-2 text-sm text-zinc-400">{item.purpose}</p><p className="mt-1 text-xs text-zinc-600">Planned {new Date(item.scheduledFor).toLocaleString()}</p>{item.blockReason && <p className="mt-2 text-xs text-amber-200">{item.blockReason}</p>}{item.post && <Link href={`/posts/${item.post.id}`} className="mt-2 inline-flex items-center gap-1 text-sm text-teal-300 hover:underline">Review {item.post.title}<ExternalLink className="h-3 w-3" /></Link>}</div>
                      <div className="flex shrink-0 flex-wrap gap-1">
                        {!item.post && item.status === "planned" && <Button size="sm" onClick={() => draft(campaign.id, item.id)} disabled={Boolean(busy)}>{busy === `draft:${item.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Draft</Button>}
                        <Button size="icon" variant="ghost" aria-label="Move stage up" onClick={() => itemAction(campaign.id, item.id, "move_up")} disabled={Boolean(busy) || index === 0}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" aria-label="Move stage down" onClick={() => itemAction(campaign.id, item.id, "move_down")} disabled={Boolean(busy) || index === campaign.items.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                        {!item.post && item.status !== "skipped" && <Button size="sm" variant="ghost" onClick={() => itemAction(campaign.id, item.id, "skip")} disabled={Boolean(busy)}>Skip</Button>}
                      </div>
                    </div>
                  </div>)}
                </div>
                <div className="grid gap-3 rounded-xl border border-white/[0.07] bg-black/15 p-4 lg:grid-cols-[1fr_auto_auto] lg:items-end"><div><div className="text-sm font-medium text-zinc-200">Record {campaign.goalMetric.replaceAll("_", " ")}</div><div className="mt-1 text-xs text-zinc-500">Latest manual destination metric; post engagement remains sourced from Analytics.</div></div><Input type="number" min="0" value={metricValues[campaign.id] || ""} onChange={(event) => setMetricValues((current) => ({ ...current, [campaign.id]: event.target.value }))} placeholder="Current value" /><Button variant="secondary" onClick={() => recordMetric(campaign)} disabled={Boolean(busy) || !metricValues[campaign.id]}><BarChart3 className="h-4 w-4" /> Record</Button></div>
              </>}
            </CardContent>
          </Card>;
        })}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/[0.06] bg-black/10 p-3"><div className="text-lg font-semibold text-zinc-100">{value}</div><div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-zinc-600">{label}</div></div>;
}
