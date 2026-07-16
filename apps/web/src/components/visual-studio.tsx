"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface AssetView {
  id: string;
  kind: string;
  targetPlatform: string;
  status: string;
  filePath: string | null;
  previewPath: string | null;
  mimeType: string | null;
  pageCount: number;
  altText: string | null;
  error: string | null;
  createdAt: string;
}

export function VisualStudio({
  postId,
  brief,
  assets,
  recommendedMedia,
  currentMedia,
  mediaExperimentVariant,
  mediaExperimentPlatform,
}: {
  postId: string;
  brief: {
    title: string;
    subtitle: string;
    bullets: string[];
    takeaway: string;
    altText: string;
  };
  assets: AssetView[];
  recommendedMedia: { x: string; linkedin: string };
  currentMedia: { x: string; linkedin: string };
  mediaExperimentVariant?: "text_only" | "branded_visual";
  mediaExperimentPlatform?: "x" | "linkedin";
}) {
  const router = useRouter();
  const [kind, setKind] = useState<"portrait_card" | "linkedin_carousel">(
    recommendedMedia.linkedin === "carousel" ? "linkedin_carousel" : "portrait_card",
  );
  const [targetPlatform, setTargetPlatform] = useState<"both" | "x" | "linkedin">(
    recommendedMedia.linkedin === "carousel"
      ? "linkedin"
      : recommendedMedia.x === "text_only"
        ? "linkedin"
        : recommendedMedia.linkedin === "text_only"
          ? "x"
          : "both",
  );
  const [title, setTitle] = useState(brief.title);
  const [subtitle, setSubtitle] = useState(brief.subtitle);
  const [bullets, setBullets] = useState(brief.bullets.join("\n"));
  const [takeaway, setTakeaway] = useState(brief.takeaway);
  const [altText, setAltText] = useState(brief.altText);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function generate() {
    setBusy("generate");
    setMessage("");
    try {
      const response = await fetch(`/api/posts/${postId}/visuals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          targetPlatform: kind === "linkedin_carousel" ? "linkedin" : targetPlatform,
          title,
          subtitle,
          bullets: bullets.split("\n").map((item) => item.trim()).filter(Boolean),
          takeaway,
          altText,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not render visual");
      setMessage(kind === "linkedin_carousel" ? "Carousel PDF and cover preview generated." : "Portrait card generated.");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not render visual");
    } finally {
      setBusy(null);
    }
  }

  async function remove(assetId: string) {
    if (!confirm("Delete this generated visual?")) return;
    setBusy(assetId);
    setMessage("");
    const response = await fetch(`/api/posts/${postId}/visuals/${assetId}`, { method: "DELETE" });
    const data = await response.json();
    setBusy(null);
    if (!response.ok) {
      setMessage(data.error || "Could not delete visual");
      return;
    }
    setMessage("Visual deleted.");
    router.refresh();
  }

  const targetOverlapsTextOnlyExperiment =
    mediaExperimentVariant === "text_only" &&
    (targetPlatform === "both" || targetPlatform === mediaExperimentPlatform);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-teal-400/15 bg-teal-400/[0.035] px-3 py-2.5 text-sm text-zinc-300">
        <span className="font-medium text-teal-200">Media recommendation:</span>{" "}
        X: {recommendedMedia.x.replace(/_/g, " ")} · LinkedIn: {recommendedMedia.linkedin.replace(/_/g, " ")}.
        <span className="ml-2 text-xs text-zinc-600">
          Current — X: {currentMedia.x.replace(/_/g, " ")} · LinkedIn: {currentMedia.linkedin.replace(/_/g, " ")}
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1 text-xs text-zinc-500">
              <span>Asset type</span>
              <select
                value={kind}
                onChange={(event) => {
                  const next = event.target.value as typeof kind;
                  setKind(next);
                  if (next === "linkedin_carousel") setTargetPlatform("linkedin");
                }}
                className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200"
              >
                <option value="portrait_card">Portrait technical card</option>
                <option value="linkedin_carousel">LinkedIn carousel PDF</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-zinc-500">
              <span>Attach on</span>
              <select
                value={kind === "linkedin_carousel" ? "linkedin" : targetPlatform}
                disabled={kind === "linkedin_carousel"}
                onChange={(event) => setTargetPlatform(event.target.value as typeof targetPlatform)}
                className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-200 disabled:opacity-60"
              >
                <option value="both">X and LinkedIn</option>
                <option value="x">X only</option>
                <option value="linkedin">LinkedIn only</option>
              </select>
            </label>
            <label className="space-y-1 text-xs text-zinc-500">
              <span>Alt text</span>
              <Input value={altText} onChange={(event) => setAltText(event.target.value)} />
            </label>
          </div>
          <label className="block space-y-1 text-xs text-zinc-500">
            <span>Visual title</span>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label className="block space-y-1 text-xs text-zinc-500">
            <span>Supporting context</span>
            <Textarea rows={3} value={subtitle} onChange={(event) => setSubtitle(event.target.value)} />
          </label>
          <label className="block space-y-1 text-xs text-zinc-500">
            <span>Verified details — one per line</span>
            <Textarea rows={5} value={bullets} onChange={(event) => setBullets(event.target.value)} />
          </label>
          <label className="block space-y-1 text-xs text-zinc-500">
            <span>Carousel takeaway</span>
            <Textarea rows={3} value={takeaway} onChange={(event) => setTakeaway(event.target.value)} />
          </label>
          <Button disabled={!!busy || targetOverlapsTextOnlyExperiment} onClick={generate}>
            {busy === "generate" ? "Rendering…" : kind === "linkedin_carousel" ? "Generate carousel" : "Generate technical card"}
          </Button>
          {message && <p className="text-xs leading-relaxed text-zinc-400">{message}</p>}
        </div>

        <div className="space-y-3">
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-zinc-500">Generated assets</div>
          {assets.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-zinc-600">
              No branded assets yet. Review the grounded brief, then render a card or carousel.
            </div>
          )}
          {assets.map((asset) => (
            <div key={asset.id} className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
              {asset.previewPath && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={asset.previewPath} alt={asset.altText || "Generated technical visual"} className="w-full rounded-lg border border-white/[0.06]" />
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-zinc-200">
                    {asset.kind === "linkedin_carousel" ? `LinkedIn carousel · ${asset.pageCount} pages` : "Portrait technical card"}
                  </div>
                  <div className="text-xs text-zinc-600">{asset.targetPlatform} · {asset.status} · {new Date(asset.createdAt).toLocaleString()}</div>
                </div>
                <div className="flex gap-2">
                  {asset.filePath && (
                    <a href={asset.filePath} download className="inline-flex h-8 items-center rounded-lg border border-teal-400/20 px-3 text-xs font-medium text-teal-200 hover:bg-teal-400/10">
                      Download {asset.mimeType === "application/pdf" ? "PDF" : "PNG"}
                    </a>
                  )}
                  <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => remove(asset.id)}>Delete</Button>
                </div>
              </div>
              {asset.error && <p className="mt-2 text-xs text-rose-300">{asset.error}</p>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
