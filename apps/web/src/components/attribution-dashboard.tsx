"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  Bot,
  Copy,
  ExternalLink,
  Link2,
  Loader2,
  MousePointerClick,
  Pause,
  Play,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AttributionBreakdown } from "@/lib/attribution/report";

interface ReportView {
  funnel: {
    impressions: number;
    engagements: number;
    engagementRate: number;
    profileVisits: number;
    clicks: number;
    clickRate: number;
    conversions: number;
    unattributedConversions: number;
    conversionRate: number;
    followersGained: number;
    followRate: number;
    botHits: number;
  };
  byPlatform: AttributionBreakdown[];
  byStage: AttributionBreakdown[];
  byCtaVariant: AttributionBreakdown[];
  byPlacement: AttributionBreakdown[];
  byExperiment: AttributionBreakdown[];
  recommendations: string[];
}

interface LinkView {
  id: string;
  label: string;
  platform: string;
  status: string;
  trackedUrl: string;
  destinationUrl: string;
  clicksCount: number;
  botHits: number;
  ctaVariant: string;
  ctaPlacement: string;
  postLabel: string | null;
  campaignLabel: string | null;
  stageLabel: string | null;
  experimentLabel: string | null;
  createdAt: string;
}

export function AttributionDashboard({ report, posts, links, conversions }: {
  report: ReportView;
  posts: Array<{ id: string; label: string; platform: string; campaignLabel: string | null; defaultDestination: string | null }>;
  links: LinkView[];
  conversions: Array<{ id: string; eventType: string; value: number; source: string; platform: string | null; occurredAt: string; trackedLinkId: string | null }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedPost, setSelectedPost] = useState(posts[0]?.id || "");
  const selected = posts.find((post) => post.id === selectedPost);

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

  async function createLink(formData: FormData) {
    const input = Object.fromEntries(formData.entries());
    const result = await call(
      "/api/attribution/links",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) },
      "create-link",
    );
    if (result) setMessage("Tracked link created. Copy it into the matching platform post.");
  }

  async function recordConversion(formData: FormData) {
    const result = await call(
      "/api/attribution/conversions",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.fromEntries(formData.entries())) },
      "conversion",
    );
    if (result) setMessage("Explicit conversion event recorded.");
  }

  async function toggleLink(link: LinkView) {
    await call(
      `/api/attribution/links/${link.id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: link.status === "active" ? "pause" : "activate" }) },
      `link:${link.id}`,
    );
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setMessage("Tracked URL copied.");
    } catch {
      setError("Clipboard access was unavailable. Select and copy the URL manually.");
    }
  }

  const stats = [
    ["Impressions", report.funnel.impressions.toLocaleString(), `${report.funnel.engagementRate.toFixed(2)}% engagement`],
    ["Profile visits", report.funnel.profileVisits.toLocaleString(), `${report.funnel.followRate.toFixed(2)}% became followers`],
    ["Tracked clicks", report.funnel.clicks.toLocaleString(), `${report.funnel.clickRate.toFixed(2)}% click rate`],
    ["Conversions", report.funnel.conversions.toLocaleString(), `${report.funnel.conversionRate.toFixed(2)}% of clicks · ${report.funnel.unattributedConversions} unattributed`],
    ["Followers", `${report.funnel.followersGained >= 0 ? "+" : ""}${report.funnel.followersGained}`, "From linked-post snapshots"],
    ["Filtered previews", report.funnel.botHits.toLocaleString(), "Aggregate obvious bot/prefetch hits"],
  ];

  return <div className="space-y-6">
    {(message || error) && <div className={`rounded-xl border px-3 py-2 text-sm ${error ? "border-rose-400/20 bg-rose-400/[0.06] text-rose-200" : "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200"}`}>{error || message}</div>}
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">{stats.map(([label, value, hint]) => <Card key={label} className="p-4"><div className="text-xl font-semibold text-zinc-50">{value}</div><div className="mt-1 text-[10px] uppercase tracking-[0.14em] text-zinc-500">{label}</div><div className="mt-2 text-[11px] text-zinc-600">{hint}</div></Card>)}</div>

    <Card className="border-cyan-400/15 bg-cyan-400/[0.025]"><CardHeader><CardTitle>Privacy boundary</CardTitle><CardDescription>Redirects store one aggregate count per link per five-second window. User agents are inspected transiently only to discard obvious bots and previews; no IP, user agent, cookie, fingerprint, or individual click event is retained.</CardDescription></CardHeader></Card>

    <div className="grid gap-6 xl:grid-cols-2">
      <Card><CardHeader><CardTitle>Create a tracked link</CardTitle><CardDescription>Use a different link for each platform, CTA treatment, and post.</CardDescription></CardHeader><CardContent><form action={createLink} className="space-y-3">
        <select name="postId" value={selectedPost} onChange={(event) => setSelectedPost(event.target.value)} required className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200"><option value="">Select a post</option>{posts.map((post) => <option key={post.id} value={post.id}>{post.campaignLabel ? `${post.campaignLabel} — ` : ""}{post.label}</option>)}</select>
        <div className="grid gap-3 sm:grid-cols-2"><select name="platform" defaultValue={selected?.platform === "linkedin" ? "linkedin" : "x"} className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200"><option value="x">X</option><option value="linkedin">LinkedIn</option></select><Input name="label" required placeholder="Link label" /></div>
        <Input name="destinationUrl" type="url" required key={selectedPost} defaultValue={selected?.defaultDestination || ""} placeholder="https://github.com/… or product URL" />
        <div className="grid gap-3 sm:grid-cols-2"><Input name="ctaVariant" placeholder="CTA variant (inherits Phase 5 when blank)" /><select name="ctaPlacement" className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200"><option value="final">Final CTA</option><option value="inline">Inline CTA</option></select></div>
        <Button type="submit" disabled={Boolean(busy)}>{busy === "create-link" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Create tracked link</Button>
      </form></CardContent></Card>

      <Card><CardHeader><CardTitle>Record a conversion</CardTitle><CardDescription>Conversions are explicit outcomes, never inferred from clicks or engagement.</CardDescription></CardHeader><CardContent><form action={recordConversion} className="space-y-3">
        <select name="trackedLinkId" className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200"><option value="">Unattributed/manual outcome</option>{links.map((link) => <option key={link.id} value={link.id}>{link.label} · {link.platform.toUpperCase()}</option>)}</select>
        <div className="grid gap-3 sm:grid-cols-2"><select name="eventType" className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200"><option value="github_star">GitHub star</option><option value="beta_signup">Beta signup</option><option value="waitlist_signup">Waitlist signup</option><option value="follower">Follower</option><option value="repository_visit">Repository visit</option><option value="conversion">Other conversion</option></select><Input name="value" type="number" min="0" defaultValue="1" required /></div>
        <Textarea name="notes" placeholder="Source or context for this manual outcome" />
        <Button type="submit" variant="secondary" disabled={Boolean(busy)}>{busy === "conversion" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />} Record conversion</Button>
      </form></CardContent></Card>
    </div>

    <Card><CardHeader><CardTitle>Tracked links</CardTitle><CardDescription>Preview links use a non-counting query flag. Actual social clicks redirect with UTM attribution.</CardDescription></CardHeader><CardContent className="space-y-3">{links.length === 0 ? <Empty text="Create the first post-specific tracked link to begin attribution." /> : links.map((link) => <div key={link.id} className="rounded-xl border border-white/[0.07] bg-black/15 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge>{link.platform === "x" ? "X" : "LinkedIn"}</Badge><Badge>{link.ctaVariant}</Badge><Badge>{link.ctaPlacement}</Badge><Badge>{link.status}</Badge>{link.experimentLabel && <Badge className="text-violet-200">{link.experimentLabel}</Badge>}</div><div className="mt-2 text-sm font-medium text-zinc-100">{link.label}</div><div className="mt-1 text-xs text-zinc-500">{link.campaignLabel || "Isolated post"}{link.stageLabel ? ` · ${link.stageLabel}` : ""}{link.postLabel ? ` · ${link.postLabel}` : ""}</div><code className="mt-2 block break-all rounded bg-white/[0.03] px-2 py-1 text-xs text-cyan-300">{link.trackedUrl}</code></div><div className="flex shrink-0 flex-wrap items-center gap-2"><Badge className="text-teal-200"><MousePointerClick className="mr-1 h-3 w-3" />{link.clicksCount}</Badge>{link.botHits > 0 && <Badge><Bot className="mr-1 h-3 w-3" />{link.botHits}</Badge>}<Button size="icon" variant="secondary" onClick={() => copy(link.trackedUrl)} aria-label="Copy tracked link"><Copy className="h-4 w-4" /></Button><a href={`${link.trackedUrl}?dp_preview=1`} target="_blank" rel="noreferrer" className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 text-zinc-400 hover:text-zinc-100"><ExternalLink className="h-4 w-4" /></a><Button size="icon" variant="ghost" onClick={() => toggleLink(link)} disabled={Boolean(busy)} aria-label={link.status === "active" ? "Pause link" : "Activate link"}>{link.status === "active" ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button></div></div></div>)}</CardContent></Card>

    <Card className="border-teal-400/15 bg-teal-400/[0.025]"><CardHeader><CardTitle>Funnel diagnosis</CardTitle><CardDescription>Recommendations identify the weak transition; CTA winners still require balanced Phase 5 samples.</CardDescription></CardHeader><CardContent className="space-y-2">{report.recommendations.map((recommendation, index) => <div key={recommendation} className="flex gap-3 rounded-xl border border-white/[0.06] bg-black/15 p-3 text-sm text-zinc-300"><Badge>{index + 1}</Badge><p>{recommendation}</p></div>)}</CardContent></Card>

    <div className="grid gap-6 xl:grid-cols-2"><Breakdown title="By platform" rows={report.byPlatform} /><Breakdown title="By campaign stage" rows={report.byStage} /><Breakdown title="By CTA variant" rows={report.byCtaVariant} /><Breakdown title="By CTA placement" rows={report.byPlacement} /><Breakdown title="By Phase 5 experiment variant" rows={report.byExperiment} /></div>

    <Card><CardHeader><CardTitle>Recent conversion evidence</CardTitle></CardHeader><CardContent className="space-y-2">{conversions.length === 0 ? <Empty text="No explicit conversion events recorded yet." /> : conversions.map((event) => <div key={event.id} className="flex items-center justify-between rounded-xl border border-white/[0.06] p-3"><div><div className="text-sm font-medium text-zinc-200">{event.eventType.replaceAll("_", " ")}</div><div className="text-xs text-zinc-600">{event.source} · {new Date(event.occurredAt).toLocaleString()}</div></div><Badge>+{event.value}</Badge></div>)}</CardContent></Card>
  </div>;
}

function Breakdown({ title, rows }: { title: string; rows: AttributionBreakdown[] }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>{rows.length === 0 ? <Empty text="No attributed data yet." /> : <div className="overflow-x-auto"><table className="w-full min-w-[32rem] text-left text-sm"><thead className="text-xs uppercase text-zinc-600"><tr><th className="pb-2">Group</th><th className="pb-2 text-right">Links</th><th className="pb-2 text-right">Clicks</th><th className="pb-2 text-right">CTR</th><th className="pb-2 text-right">Conversions</th></tr></thead><tbody>{rows.map((row) => <tr key={row.key} className="border-t border-white/[0.06]"><td className="py-2.5 text-zinc-200">{row.label}</td><td className="py-2.5 text-right text-zinc-400">{row.links}</td><td className="py-2.5 text-right text-zinc-400">{row.clicks}</td><td className="py-2.5 text-right text-teal-300">{row.clickRate.toFixed(2)}%</td><td className="py-2.5 text-right text-zinc-400">{row.conversions}</td></tr>)}</tbody></table></div>}</CardContent></Card>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">{text}</div>;
}
