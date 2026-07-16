"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  BookmarkPlus,
  Check,
  ExternalLink,
  Loader2,
  MessageCircleMore,
  Send,
  Sparkles,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { WorkflowAction } from "@/lib/distribution/service";

interface WorkflowView {
  id: string;
  postId: string;
  postTitle: string;
  postStatus: string;
  platform: string;
  status: string;
  scheduledFor: string | null;
  nextAction: string;
  nextActionKey: WorkflowAction | null;
  completedSteps: number;
}

interface OpportunityView {
  id: string;
  platform: string;
  url: string;
  author: string | null;
  topic: string | null;
  context: string;
  suggestedReply: string | null;
  score: number;
  reason: string;
}

interface RelationshipView {
  id: string;
  platform: string;
  handle: string;
  displayName: string | null;
  status: string;
  priorityScore: number;
  replyCount: number;
  lastInteractionAt: string | null;
}

interface SignalView {
  id: string;
  kind: string;
  text: string;
  sourceUrl: string | null;
  createdAt: string;
}

interface Comparison {
  assisted: { records: number; impressions: number; engagementRate: number; followersGained: number };
  baseline: { records: number; impressions: number; engagementRate: number; followersGained: number };
}

export function DistributionWorkspace({
  workflows,
  opportunities,
  relationships,
  signals,
  comparison,
}: {
  workflows: WorkflowView[];
  opportunities: OpportunityView[];
  relationships: RelationshipView[];
  signals: SignalView[];
  comparison: Comparison;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(opportunities.map((item) => [item.id, item.suggestedReply || ""])),
  );

  async function call(url: string, init: RequestInit, key: string) {
    setBusy(key);
    setError("");
    setMessage("");
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

  async function advance(workflow: WorkflowView) {
    if (!workflow.nextActionKey) return;
    const result = await call(
      `/api/distribution/workflows/${workflow.id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: workflow.nextActionKey }) },
      `workflow:${workflow.id}`,
    );
    if (result) setMessage(`${workflow.platform.toUpperCase()}: ${workflow.nextAction} recorded.`);
  }

  async function draftReply(opportunity: OpportunityView) {
    const result = await call(
      `/api/engagement/opportunities/${opportunity.id}/draft`,
      { method: "POST" },
      `draft:${opportunity.id}`,
    );
    if (result && typeof result.reply === "string") {
      setDrafts((current) => ({ ...current, [opportunity.id]: result.reply as string }));
      setMessage(result.mode === "ai" ? "Grounded reply drafted." : "Safe fallback drafted; review before using.");
    }
  }

  async function saveReply(opportunity: OpportunityView, replied = false) {
    const result = await call(
      `/api/engagement/opportunities/${opportunity.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestedReply: drafts[opportunity.id] || "", ...(replied ? { status: "replied" } : {}) }),
      },
      `reply:${opportunity.id}`,
    );
    if (result) setMessage(replied ? "Manual reply recorded and relationship updated." : "Reply draft saved.");
  }

  async function saveSignal(opportunity: OpportunityView) {
    const text = opportunity.topic || opportunity.context.split(/\n|[.!?]\s/)[0] || opportunity.context;
    const result = await call(
      "/api/distribution/signals",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId: opportunity.id, kind: "question", text, sourceUrl: opportunity.url }),
      },
      `signal:${opportunity.id}`,
    );
    if (result) setMessage("Conversation saved as a future content signal.");
  }

  async function updateSignal(id: string, status: "used" | "dismissed") {
    await call(
      `/api/distribution/signals/${id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) },
      `saved:${id}`,
    );
  }

  async function updateRelationship(id: string, status: string, priorityScore: number) {
    await call(
      `/api/distribution/relationships/${id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, priorityScore }) },
      `relationship:${id}`,
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active post cycles" value={workflows.length} hint="X and LinkedIn tracked separately" />
        <Stat label="Priority conversations" value={opportunities.length} hint="Ranked by relevance and freshness" />
        <Stat label="Creator relationships" value={relationships.filter((item) => item.status !== "muted").length} hint="Built from recorded manual replies" />
        <Stat label="Audience signals" value={signals.length} hint="Questions available for future posts" />
      </div>
      {(message || error) && (
        <div className={`rounded-xl border px-3 py-2 text-sm ${error ? "border-rose-400/20 bg-rose-400/[0.06] text-rose-200" : "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200"}`}>
          {error || message}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s publishing cycles</CardTitle>
          <CardDescription>Complete the next manual action for each platform. Recording an action never performs it on X or LinkedIn.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {workflows.length === 0 ? <Empty text="Approve or mark a post ready to create its X and LinkedIn distribution cycles." /> : workflows.map((workflow) => (
            <div key={workflow.id} className="flex flex-col gap-4 rounded-xl border border-white/[0.07] bg-black/15 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><Badge>{workflow.platform === "x" ? "X" : "LinkedIn"}</Badge><Badge>{workflow.completedSteps}/6 steps</Badge><span className="text-xs text-zinc-600">{workflow.postStatus}</span></div>
                <Link href={`/posts/${workflow.postId}`} className="mt-2 block truncate text-sm font-medium text-zinc-100 hover:text-teal-200">{workflow.postTitle}</Link>
                <p className="mt-1 text-xs text-zinc-500">Next: {workflow.nextAction}</p>
              </div>
              {workflow.nextActionKey && <Button size="sm" onClick={() => advance(workflow)} disabled={Boolean(busy)}>{busy === `workflow:${workflow.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{workflow.nextAction}</Button>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div><CardTitle>Priority conversation queue</CardTitle><CardDescription>Reply because you can add value—not merely because a post is popular.</CardDescription></div>
          <Button variant="outline" size="sm" onClick={() => router.push("/engagement")}><MessageCircleMore className="h-4 w-4" /> Add or refresh conversations</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {opportunities.length === 0 ? <Empty text="No new conversations. Add one manually or refresh read-only X search from Engagement." /> : opportunities.map((opportunity) => (
            <div key={opportunity.id} className="rounded-xl border border-white/[0.07] bg-black/15 p-4">
              <div className="flex flex-wrap items-center gap-2"><Badge>{opportunity.platform === "x" ? "X" : "LinkedIn"}</Badge><Badge className="border-teal-400/20 bg-teal-400/10 text-teal-200">priority {opportunity.score}</Badge><span className="text-xs text-zinc-600">{opportunity.reason}</span></div>
              <a href={opportunity.url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-cyan-300 hover:underline">{opportunity.topic || opportunity.author || "Open conversation"}<ExternalLink className="h-3 w-3" /></a>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">{opportunity.context}</p>
              <Textarea className="mt-3" value={drafts[opportunity.id] || ""} onChange={(event) => setDrafts((current) => ({ ...current, [opportunity.id]: event.target.value }))} placeholder="Draft a useful, specific reply…" />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => draftReply(opportunity)} disabled={Boolean(busy)}>{busy === `draft:${opportunity.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Draft grounded reply</Button>
                <Button size="sm" variant="outline" onClick={() => saveReply(opportunity)} disabled={Boolean(busy)}>Save draft</Button>
                <Button size="sm" onClick={() => saveReply(opportunity, true)} disabled={Boolean(busy) || !(drafts[opportunity.id] || "").trim()}><Send className="h-4 w-4" /> I replied manually</Button>
                <Button size="sm" variant="ghost" onClick={() => saveSignal(opportunity)} disabled={Boolean(busy)}><BookmarkPlus className="h-4 w-4" /> Save content signal</Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Relationship ledger</CardTitle><CardDescription>Prioritize repeated, relevant conversations instead of chasing random accounts.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {relationships.length === 0 ? <Empty text="Relationships appear after you mark a reply as manually posted." /> : relationships.map((relationship) => (
              <div key={relationship.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] p-3">
                <div className="min-w-0"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-violet-300" /><span className="truncate text-sm font-medium text-zinc-200">{relationship.displayName || `@${relationship.handle}`}</span><Badge>{relationship.platform === "x" ? "X" : "LinkedIn"}</Badge></div><p className="mt-1 text-xs text-zinc-500">{relationship.replyCount} replies · priority {relationship.priorityScore} · {relationship.status}</p></div>
                <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => updateRelationship(relationship.id, "watch", 80)} disabled={Boolean(busy)}>Prioritize</Button><Button size="sm" variant="ghost" onClick={() => updateRelationship(relationship.id, "muted", 0)} disabled={Boolean(busy)}>Mute</Button></div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Comment-to-content loop</CardTitle><CardDescription>Real questions and objections are stronger prompts than generic topic lists.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {signals.length === 0 ? <Empty text="Save a useful conversation as a content signal to build this queue." /> : signals.map((signal) => (
              <div key={signal.id} className="rounded-xl border border-white/[0.06] p-3"><div className="flex items-start justify-between gap-3"><div><Badge>{signal.kind}</Badge><p className="mt-2 text-sm leading-relaxed text-zinc-300">{signal.text}</p></div>{signal.sourceUrl && <a href={signal.sourceUrl} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-teal-300"><ExternalLink className="h-4 w-4" /></a>}</div><div className="mt-3 flex gap-2"><Button size="sm" variant="secondary" onClick={() => updateSignal(signal.id, "used")} disabled={Boolean(busy)}>Mark used</Button><Button size="sm" variant="ghost" onClick={() => updateSignal(signal.id, "dismissed")} disabled={Boolean(busy)}>Dismiss</Button></div></div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Distribution comparison</CardTitle><CardDescription>Early directional evidence only: compare platform snapshots for cycles where pre-publish engagement was recorded against the current baseline.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <ComparisonCard label="Engagement-assisted" data={comparison.assisted} />
          <ComparisonCard label="Baseline" data={comparison.baseline} />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return <Card className="p-4"><div className="text-2xl font-semibold text-zinc-50">{value}</div><div className="mt-1 text-xs uppercase tracking-[0.15em] text-zinc-500">{label}</div><div className="mt-2 text-xs text-zinc-600">{hint}</div></Card>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-500">{text}</div>;
}

function ComparisonCard({ label, data }: { label: string; data: Comparison["assisted"] }) {
  return <div className="rounded-xl border border-white/[0.07] bg-black/15 p-4"><div className="flex items-center justify-between"><span className="text-sm font-medium text-zinc-200">{label}</span><ArrowRight className="h-4 w-4 text-zinc-600" /></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div><div className="text-lg font-semibold text-zinc-100">{data.records}</div><div className="text-[10px] uppercase text-zinc-600">records</div></div><div><div className="text-lg font-semibold text-teal-300">{data.engagementRate.toFixed(2)}%</div><div className="text-[10px] uppercase text-zinc-600">engagement</div></div><div><div className="text-lg font-semibold text-zinc-100">{data.followersGained >= 0 ? "+" : ""}{data.followersGained}</div><div className="text-[10px] uppercase text-zinc-600">followers</div></div></div></div>;
}
