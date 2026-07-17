"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface PerformanceSnapshotView {
  id: string;
  platform: string;
  impressions: number;
  likes: number;
  replies: number;
  reposts: number;
  saves: number;
  profileVisits: number;
  linkClicks: number;
  followersBefore: number | null;
  followersAfter: number | null;
  capturedAt: string;
  checkpoint?: string;
}

const METRICS = [
  ["impressions", "Impressions"],
  ["likes", "Likes"],
  ["replies", "Replies/comments"],
  ["reposts", "Reposts/shares"],
  ["saves", "Saves"],
  ["profileVisits", "Profile visits"],
  ["linkClicks", "Link clicks"],
] as const;

function actions(snapshot: PerformanceSnapshotView): number {
  return snapshot.likes + snapshot.replies + snapshot.reposts + snapshot.saves + snapshot.linkClicks;
}

export function PerformanceForm({
  postId,
  snapshots,
}: {
  postId: string;
  snapshots: PerformanceSnapshotView[];
}) {
  const [localSnapshots, setLocalSnapshots] = useState(snapshots);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [platform, setPlatform] = useState<"x" | "linkedin">("x");
  const [checkpoint, setCheckpoint] = useState<"1h" | "24h" | "72h" | "7d" | "custom">("24h");

  async function submit(formData: FormData) {
    setSaving(true);
    setError("");
    const payload = Object.fromEntries(formData.entries());
    try {
      const response = await fetch(`/api/posts/${postId}/performance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, platform, checkpoint }),
      });
      const data = await response.json() as { error?: string; snapshot?: PerformanceSnapshotView };
      if (!response.ok) throw new Error(data.error || "Could not save metrics");
      if (data.snapshot) setLocalSnapshots((current) => [data.snapshot!, ...current]);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save metrics");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <form action={submit} className="space-y-4">
        <div className="flex gap-2">
          {(["x", "linkedin"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setPlatform(value)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                platform === value
                  ? "border-teal-400/30 bg-teal-400/10 text-teal-200"
                  : "border-white/10 bg-white/[0.03] text-zinc-400"
              }`}
            >
              {value === "x" ? "X" : "LinkedIn"}
            </button>
          ))}
        </div>
        <label className="block max-w-xs space-y-1 text-xs text-zinc-500">
          <span>Measurement checkpoint</span>
          <select value={checkpoint} onChange={(event) => setCheckpoint(event.target.value as typeof checkpoint)} className="h-10 w-full rounded-xl border border-white/10 bg-[#0d0f14] px-3 text-sm text-zinc-200 outline-none focus:border-teal-400/40">
            <option value="1h">1 hour — early reach</option>
            <option value="24h">24 hours — primary comparison</option>
            <option value="72h">72 hours — secondary distribution</option>
            <option value="7d">7 days — long tail</option>
            <option value="custom">Custom / outside checkpoint</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {METRICS.map(([name, label]) => (
            <label key={name} className="space-y-1 text-xs text-zinc-500">
              <span>{label}</span>
              <Input name={name} type="number" min="0" defaultValue="0" inputMode="numeric" />
            </label>
          ))}
          <label className="space-y-1 text-xs text-zinc-500">
            <span>Followers before</span>
            <Input name="followersBefore" type="number" min="0" inputMode="numeric" />
          </label>
          <label className="space-y-1 text-xs text-zinc-500">
            <span>Followers after</span>
            <Input name="followersAfter" type="number" min="0" inputMode="numeric" />
          </label>
        </div>
        <label className="block space-y-1 text-xs text-zinc-500">
          <span>Notes</span>
          <Input name="notes" placeholder="e.g. metrics captured 24h after posting" />
        </label>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        <Button type="submit" disabled={saving} size="sm">
          {saving ? "Saving…" : "Save cumulative snapshot"}
        </Button>
      </form>

      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Snapshot history
        </div>
        {localSnapshots.length === 0 && (
          <p className="text-sm text-zinc-500">No performance recorded yet.</p>
        )}
        {localSnapshots.slice(0, 8).map((snapshot) => {
          const engagementRate = snapshot.impressions
            ? (actions(snapshot) / snapshot.impressions) * 100
            : 0;
          const followers =
            snapshot.followersBefore != null && snapshot.followersAfter != null
              ? snapshot.followersAfter - snapshot.followersBefore
              : null;
          return (
            <div
              key={snapshot.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-xs"
            >
              <span className="font-medium text-zinc-200">
                {snapshot.platform === "x" ? "X" : "LinkedIn"} · {snapshot.impressions.toLocaleString()} impressions
              </span>
              <span className="text-zinc-500">
                {engagementRate.toFixed(2)}% engagement
                {followers != null ? ` · ${followers >= 0 ? "+" : ""}${followers} followers` : ""}
                {` · ${snapshot.checkpoint || "custom"} · ${new Date(snapshot.capturedAt).toLocaleDateString()}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
