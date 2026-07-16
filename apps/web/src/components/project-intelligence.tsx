"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, GitBranch, Loader2, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface RepositoryView {
  id: string;
  name: string;
  fullName: string;
  url: string;
  active: boolean;
  syncStatus: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  changeCount: number;
  factCount: number;
}

interface FactView {
  id: string;
  repositoryName: string;
  fullName: string;
  title: string;
  claim: string;
  sourceUrl: string;
  confidence: number;
  reviewStatus: string;
  useCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  kind: string;
  externalId: string;
  occurredAt: string;
  changedFiles: string[];
}

interface IgnoredChangeView {
  id: string;
  repositoryName: string;
  title: string;
  kind: string;
  reason: string;
  score: number;
  url: string;
  occurredAt: string;
}

function dateLabel(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function statusClass(status: string) {
  if (status === "approved" || status === "completed") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-200";
  if (status === "rejected" || status === "failed") return "border-rose-400/20 bg-rose-400/10 text-rose-200";
  if (status === "running") return "border-cyan-400/20 bg-cyan-400/10 text-cyan-200";
  return "border-amber-400/20 bg-amber-400/10 text-amber-200";
}

export function ProjectIntelligence({
  repositories,
  facts,
  ignoredChanges,
}: {
  repositories: RepositoryView[];
  facts: FactView[];
  ignoredChanges: IgnoredChangeView[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [fullName, setFullName] = useState("");
  const [name, setName] = useState("");
  const pending = useMemo(() => facts.filter((fact) => fact.reviewStatus === "pending"), [facts]);
  const approved = useMemo(() => facts.filter((fact) => fact.reviewStatus === "approved"), [facts]);

  async function request(url: string, init: RequestInit, key: string) {
    setBusy(key);
    setMessage("");
    try {
      const response = await fetch(url, init);
      const data = (await response.json()) as { error?: string; totals?: { factsCreated: number; ignoredChanges: number; failures: number } };
      if (!response.ok) throw new Error(data.error || "Request failed");
      if (data.totals) {
        setMessage(
          `Sync complete: ${data.totals.factsCreated} new fact${data.totals.factsCreated === 1 ? "" : "s"}, ${data.totals.ignoredChanges} routine change${data.totals.ignoredChanges === 1 ? "" : "s"} ignored${data.totals.failures ? `, ${data.totals.failures} failed` : ""}.`,
        );
      }
      router.refresh();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function sync(repositoryId?: string) {
    await request(
      "/api/projects/sync",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ repositoryId }) },
      repositoryId ? `sync:${repositoryId}` : "sync:all",
    );
  }

  async function decideFact(id: string, action: "approve" | "reject" | "reset") {
    await request(
      `/api/projects/facts/${id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) },
      `fact:${id}`,
    );
  }

  async function toggleRepository(repository: RepositoryView) {
    await request(
      `/api/projects/repositories/${repository.id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !repository.active }) },
      `repo:${repository.id}`,
    );
  }

  async function addRepository(event: React.FormEvent) {
    event.preventDefault();
    const ok = await request(
      "/api/projects",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName, name }) },
      "add",
    );
    if (ok) {
      setFullName("");
      setName("");
      setMessage("Repository added. Sync it to discover reviewable facts.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Active repositories", repositories.filter((repo) => repo.active).length],
          ["Awaiting review", pending.length],
          ["Approved evidence", approved.length],
        ].map(([label, value]) => (
          <Card key={label} className="p-4">
            <div className="text-2xl font-semibold text-zinc-50">{value}</div>
            <div className="mt-1 text-xs uppercase tracking-[0.16em] text-zinc-500">{label}</div>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle>Owned repositories</CardTitle>
            <CardDescription>Read-only GitHub sync. A token is optional for public repos but recommended for a higher API limit.</CardDescription>
          </div>
          <Button onClick={() => sync()} disabled={Boolean(busy)}>
            {busy === "sync:all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Sync active repositories
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {message && <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] px-3 py-2 text-sm text-cyan-100">{message}</div>}
          <div className="grid gap-3 lg:grid-cols-3">
            {repositories.map((repository) => (
              <div key={repository.id} className="rounded-xl border border-white/[0.07] bg-black/15 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-100">{repository.name}</div>
                    <a href={repository.url} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 truncate text-xs text-zinc-500 hover:text-teal-300">
                      {repository.fullName}<ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                  </div>
                  <Badge className={statusClass(repository.syncStatus)}>{repository.syncStatus.replaceAll("_", " ")}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-zinc-400">
                  <span>{repository.changeCount} changes</span><span>{repository.factCount} facts</span>
                  <span className="col-span-2">Last sync: {dateLabel(repository.lastSyncedAt)}</span>
                </div>
                {repository.lastError && <p className="mt-3 text-xs leading-relaxed text-rose-300">{repository.lastError}</p>}
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => sync(repository.id)} disabled={Boolean(busy) || !repository.active}>
                    {busy === `sync:${repository.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggleRepository(repository)} disabled={Boolean(busy)}>
                    {repository.active ? "Pause" : "Enable"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={addRepository} className="grid gap-2 rounded-xl border border-dashed border-white/10 p-3 sm:grid-cols-[1fr_1fr_auto]">
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="owner/repository" required />
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Display name (optional)" />
            <Button type="submit" variant="outline" disabled={Boolean(busy)}><Plus className="h-4 w-4" /> Add repository</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fact review queue</CardTitle>
          <CardDescription>Approval makes a fact eligible for generation. It does not create or publish a post by itself.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {pending.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-500">No facts awaiting review. Sync a repository after meaningful product work lands.</div>
          ) : pending.map((fact) => (
            <FactCard key={fact.id} fact={fact} busy={busy === `fact:${fact.id}`} onAction={decideFact} />
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Approved source ledger</CardTitle><CardDescription>Unused approved facts are preferred first; use count prevents one change from dominating your feed.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {approved.length === 0 ? <p className="text-sm text-zinc-500">No approved facts yet.</p> : approved.map((fact) => (
              <div key={fact.id} className="rounded-xl border border-emerald-400/10 bg-emerald-400/[0.025] p-3">
                <div className="flex flex-wrap items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-300" /><span className="text-sm font-medium text-zinc-100">{fact.title}</span><Badge>{fact.useCount} uses</Badge></div>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{fact.claim}</p>
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-zinc-500"><span>{fact.repositoryName} · {dateLabel(fact.occurredAt)}</span><Button size="sm" variant="ghost" onClick={() => decideFact(fact.id, "reset")} disabled={Boolean(busy)}>Review again</Button></div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Ignored routine changes</CardTitle><CardDescription>This audit trail shows what the significance filter excluded before fact review.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {ignoredChanges.length === 0 ? <p className="text-sm text-zinc-500">No ignored changes recorded yet.</p> : ignoredChanges.map((change) => (
              <a key={change.id} href={change.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/[0.06] p-3 transition hover:border-white/10 hover:bg-white/[0.02]">
                <div className="flex items-start justify-between gap-3"><div className="text-sm text-zinc-300">{change.title}</div><Badge>score {change.score}</Badge></div>
                <div className="mt-1 text-xs text-zinc-500">{change.repositoryName} · {change.reason}</div>
              </a>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function FactCard({ fact, busy, onAction }: { fact: FactView; busy: boolean; onAction: (id: string, action: "approve" | "reject") => Promise<void> }) {
  return (
    <div className="rounded-xl border border-amber-400/10 bg-amber-400/[0.025] p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><GitBranch className="h-4 w-4 text-teal-300" /><span className="font-medium text-zinc-100">{fact.title}</span><Badge>{fact.kind.replaceAll("_", " ")}</Badge><Badge>{Math.round(fact.confidence * 100)}% evidence confidence</Badge></div>
          <p className="mt-3 text-sm leading-relaxed text-zinc-300">{fact.claim}</p>
          {fact.changedFiles.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{fact.changedFiles.slice(0, 8).map((file) => <code key={file} className="rounded bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-zinc-500">{file}</code>)}</div>}
          <a href={fact.sourceUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-teal-300 hover:text-teal-200">Inspect evidence in {fact.fullName}<ExternalLink className="h-3 w-3" /></a>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => onAction(fact.id, "approve")} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve</Button>
          <Button size="sm" variant="outline" onClick={() => onAction(fact.id, "reject")} disabled={busy}><X className="h-3.5 w-3.5" /> Reject</Button>
        </div>
      </div>
    </div>
  );
}
