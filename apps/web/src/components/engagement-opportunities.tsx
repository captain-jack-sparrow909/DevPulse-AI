"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export interface OpportunityView {
  id: string;
  platform: string;
  url: string;
  author: string | null;
  topic: string | null;
  context: string;
  suggestedReply: string | null;
  status: string;
  source: string;
  discoveredAt: string;
}

export function EngagementOpportunities({
  opportunities,
  xReady,
}: {
  opportunities: OpportunityView[];
  xReady: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      opportunities.map((opportunity) => [
        opportunity.id,
        opportunity.suggestedReply || "",
      ]),
    ),
  );

  async function add(formData: FormData) {
    setBusy("add");
    setError("");
    try {
      const response = await fetch("/api/engagement/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(formData.entries())),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save opportunity");
      setMessage("Opportunity saved.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save opportunity");
    } finally {
      setBusy("");
    }
  }

  async function refreshX() {
    setBusy("refresh");
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/engagement/opportunities/refresh-x", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "X refresh failed");
      setMessage(`Found ${data.relevant} product-relevant conversation(s); stored ${data.stored}.`);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "X refresh failed");
    } finally {
      setBusy("");
    }
  }

  async function updateOpportunity(id: string, status?: string) {
    setBusy(id);
    setError("");
    try {
      const response = await fetch(`/api/engagement/opportunities/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(status ? { status } : {}),
          suggestedReply: replyDrafts[id] || "",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not update opportunity");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update opportunity");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={refreshX} disabled={!xReady || Boolean(busy)} variant="secondary">
          {busy === "refresh" ? "Searching X…" : "Refresh X conversations"}
        </Button>
        <span className="text-xs text-zinc-500">
          {xReady ? "Uses X read-only search; never posts." : "Add X_BEARER_TOKEN to enable read-only search."}
        </span>
      </div>
      {message && <p className="text-sm text-emerald-400">{message}</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}

      <form action={add} className="space-y-3 rounded-xl border border-white/[0.07] bg-black/20 p-4">
        <div className="text-sm font-medium text-zinc-200">Add an X or LinkedIn conversation</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <select name="platform" className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200">
            <option value="x">X</option>
            <option value="linkedin">LinkedIn</option>
          </select>
          <Input name="url" type="url" required placeholder="Conversation URL" className="sm:col-span-2" />
          <Input name="author" placeholder="Author (optional)" />
          <Input name="topic" placeholder="Topic" className="sm:col-span-2" />
        </div>
        <Textarea name="context" required minLength={10} placeholder="Paste the relevant post or conversation context…" />
        <Textarea name="suggestedReply" placeholder="Draft a useful reply (optional). Lead with value; do not drop a product link by default." />
        <Button type="submit" size="sm" disabled={Boolean(busy)}>
          {busy === "add" ? "Saving…" : "Save opportunity"}
        </Button>
      </form>

      <div className="space-y-3">
        {opportunities.length === 0 && (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-zinc-500">
            No conversation opportunities yet.
          </p>
        )}
        {opportunities.map((opportunity) => (
          <div key={opportunity.id} className="rounded-xl border border-white/[0.07] bg-black/20 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{opportunity.platform === "x" ? "X" : "LinkedIn"}</Badge>
              <Badge className={opportunity.status === "new" ? "text-teal-200" : "text-zinc-400"}>
                {opportunity.status}
              </Badge>
              <span className="text-xs text-zinc-600">{opportunity.source}</span>
            </div>
            <a href={opportunity.url} target="_blank" rel="noreferrer" className="mt-2 block text-sm font-medium text-cyan-300 hover:underline">
              {opportunity.topic || opportunity.author || opportunity.url}
            </a>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-400">{opportunity.context}</p>
            <div className="mt-3 space-y-2">
              <div className="text-[10px] font-medium uppercase tracking-wider text-teal-300/80">Reply draft</div>
              <Textarea
                value={replyDrafts[opportunity.id] || ""}
                onChange={(event) =>
                  setReplyDrafts((current) => ({
                    ...current,
                    [opportunity.id]: event.target.value,
                  }))
                }
                placeholder="Add one useful technical point or a focused question. Avoid a product link unless it directly answers the conversation."
              />
            </div>
            {opportunity.status === "new" && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => updateOpportunity(opportunity.id)} disabled={busy === opportunity.id}>
                  Save draft
                </Button>
                <Button size="sm" onClick={() => updateOpportunity(opportunity.id, "replied")} disabled={busy === opportunity.id}>
                  Mark replied
                </Button>
                <Button size="sm" variant="ghost" onClick={() => updateOpportunity(opportunity.id, "dismissed")} disabled={busy === opportunity.id}>
                  Dismiss
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
