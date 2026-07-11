"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CopyIconButton } from "@/components/copy-icon-button";
import {
  enforceXLimit,
  resolveDualContent,
  splitIntoXChunks,
  X_CHAR_LIMIT,
  xThreadAsCopyText,
} from "@/lib/content/platforms";
import { cn } from "@/lib/utils";

export function PostActions({
  postId,
  status,
  initialLinkedIn,
  initialXThread,
  imagePath,
}: {
  postId: string;
  status: string;
  initialLinkedIn: string;
  initialXThread: string[];
  imagePath?: string | null;
}) {
  const router = useRouter();
  const [linkedIn, setLinkedIn] = useState(initialLinkedIn);
  const [xParts, setXParts] = useState<string[]>(
    initialXThread.length ? initialXThread : splitIntoXChunks(initialLinkedIn),
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState<"linkedin" | "x" | `x-${number}` | null>(null);

  const xOverLimit = useMemo(
    () => xParts.some((p) => p.length > X_CHAR_LIMIT),
    [xParts],
  );

  async function act(action: string, extra?: Record<string, unknown>) {
    setBusy(action);
    setMessage("");
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          content: linkedIn,
          contentLinkedIn: linkedIn,
          threadJson: JSON.stringify(enforceXLimit(xParts)),
          ...extra,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Action failed");
      } else if (data.policy?.message) {
        setMessage(data.policy.message);
      } else {
        setMessage("Saved");
        if (data.threadJson) {
          try {
            setXParts(JSON.parse(data.threadJson) as string[]);
          } catch {
            /* keep local */
          }
        }
      }
      router.refresh();
    } catch {
      setMessage("Network error");
    } finally {
      setBusy(null);
    }
  }

  async function copyText(kind: "linkedin" | "x" | `x-${number}`, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      if (kind === "linkedin") {
        setMessage(
          imagePath
            ? "LinkedIn copy ready. Paste on LinkedIn and attach the screenshot if useful."
            : "LinkedIn text copied — paste into LinkedIn.",
        );
      } else if (kind === "x") {
        setMessage(
          imagePath
            ? `X thread copied (${xParts.length} post${xParts.length === 1 ? "" : "s"}). Paste in order; attach screenshot on the first post if you want.`
            : `X thread copied (${xParts.length} post${xParts.length === 1 ? "" : "s"}). Paste each tweet in order.`,
        );
      } else {
        const n = Number(kind.slice(2)) + 1;
        setMessage(`X post ${n} copied — paste into X.`);
      }
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setMessage("Could not copy — select the text manually");
    }
  }

  function updateXPart(index: number, value: string) {
    setXParts((prev) => prev.map((p, i) => (i === index ? value : p)));
  }

  function addXPart() {
    setXParts((prev) => [...prev, ""]);
  }

  function removeXPart(index: number) {
    setXParts((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }

  function rechunkFromLinkedIn() {
    setXParts(splitIntoXChunks(linkedIn));
    setMessage("Rebuilt X thread from LinkedIn text (≤280 per post). Review before posting.");
  }

  async function remove() {
    if (!confirm("Delete this post pack?")) return;
    setBusy("delete");
    await fetch(`/api/posts/${postId}`, { method: "DELETE" });
    router.push("/posts");
    router.refresh();
  }

  const canApprove = ["draft", "pending_review"].includes(status);
  const canReady = ["approved", "scheduled", "pending_review"].includes(status);
  const canMarkPosted = ["ready", "scheduled", "approved"].includes(status);

  return (
    <div className="space-y-6">
      {/* LinkedIn */}
      <section className="rounded-2xl border border-sky-500/20 bg-gradient-to-b from-sky-500/[0.06] to-transparent p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-sky-300/90">
              LinkedIn
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              Long-form · no hard 280 limit · short paragraphs work best
            </p>
          </div>
          <span
            className={cn(
              "font-mono text-xs",
              linkedIn.length > 3000 ? "text-amber-300" : "text-zinc-500",
            )}
          >
            {linkedIn.length} chars
          </span>
        </div>
        <Textarea
          value={linkedIn}
          onChange={(e) => setLinkedIn(e.target.value)}
          rows={12}
          className="mt-3"
        />
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={!!busy}
            onClick={() => copyText("linkedin", linkedIn)}
          >
            {copied === "linkedin" ? "Copied!" : "Copy LinkedIn text"}
          </Button>
        </div>
      </section>

      {/* X */}
      <section className="rounded-2xl border border-zinc-100/15 bg-gradient-to-b from-white/[0.04] to-transparent p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-200">
              X (Twitter)
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              Hard limit {X_CHAR_LIMIT} per post · large ideas become a numbered thread
            </p>
          </div>
          <span className="font-mono text-xs text-zinc-500">
            {xParts.length} post{xParts.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="mt-3 space-y-3">
          {xParts.map((part, index) => {
            const over = part.length > X_CHAR_LIMIT;
            return (
              <div
                key={index}
                className={cn(
                  "rounded-xl border p-3",
                  over
                    ? "border-rose-500/40 bg-rose-500/5"
                    : "border-white/[0.07] bg-black/25",
                )}
              >
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-400">
                    {xParts.length > 1 ? `${index + 1}/${xParts.length}` : "Post"}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "font-mono text-[11px]",
                        over ? "text-rose-300" : "text-zinc-500",
                      )}
                    >
                      {part.length}/{X_CHAR_LIMIT}
                    </span>
                    <CopyIconButton
                      text={part}
                      label={
                        xParts.length > 1
                          ? `Copy X post ${index + 1}`
                          : "Copy X post"
                      }
                      className="h-7 w-7"
                      onCopied={() => {
                        setCopied(`x-${index}`);
                        setMessage(
                          xParts.length > 1
                            ? `X post ${index + 1}/${xParts.length} copied — paste into X.`
                            : "X post copied — paste into X.",
                        );
                        setTimeout(() => setCopied(null), 2000);
                      }}
                    />
                    {xParts.length > 1 && (
                      <button
                        type="button"
                        className="text-[11px] text-zinc-500 hover:text-rose-300"
                        onClick={() => removeXPart(index)}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                <Textarea
                  value={part}
                  onChange={(e) => updateXPart(index, e.target.value)}
                  rows={3}
                  className="min-h-[72px]"
                />
              </div>
            );
          })}
        </div>

        {xOverLimit && (
          <p className="mt-2 text-xs text-rose-300">
            One or more X posts exceed {X_CHAR_LIMIT} characters. Shorten them or re-chunk before
            posting.
          </p>
        )}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            disabled={!!busy || xOverLimit}
            onClick={() => copyText("x", xThreadAsCopyText(enforceXLimit(xParts)))}
          >
            {copied === "x" ? "Copied!" : "Copy X thread"}
          </Button>
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={!!busy}
            onClick={addXPart}
          >
            Add tweet
          </Button>
          <Button
            variant="ghost"
            className="w-full sm:w-auto"
            disabled={!!busy}
            onClick={rechunkFromLinkedIn}
          >
            Rebuild X from LinkedIn
          </Button>
        </div>
      </section>

      {/* Workflow actions */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        <Button
          variant="secondary"
          className="w-full sm:w-auto"
          disabled={!!busy || xOverLimit}
          onClick={() => act("save")}
        >
          {busy === "save" ? "Saving…" : "Save both formats"}
        </Button>
        {canApprove && (
          <>
            <Button
              className="w-full sm:w-auto"
              disabled={!!busy || xOverLimit}
              onClick={() => act("approve")}
            >
              {busy === "approve" ? "…" : "Approve for slot"}
            </Button>
            <Button
              variant="danger"
              className="w-full sm:w-auto"
              disabled={!!busy}
              onClick={() => act("reject", { rejectionReason: "Rejected by user" })}
            >
              Reject
            </Button>
          </>
        )}
        {canReady && status !== "ready" && (
          <Button
            variant="secondary"
            className="w-full sm:w-auto"
            disabled={!!busy || xOverLimit}
            onClick={() => act("mark_ready")}
          >
            {busy === "mark_ready" ? "…" : "Mark ready now"}
          </Button>
        )}
        {canMarkPosted && (
          <Button
            className="w-full sm:w-auto"
            disabled={!!busy}
            onClick={() => act("mark_posted")}
          >
            {busy === "mark_posted" ? "…" : "I posted this manually"}
          </Button>
        )}
        <Button
          variant="ghost"
          className="w-full sm:w-auto"
          disabled={!!busy}
          onClick={() => act("recapture_image")}
        >
          {busy === "recapture_image" ? "Capturing…" : "Recapture screenshot"}
        </Button>
        {imagePath && (
          <Button
            variant="ghost"
            className="w-full sm:w-auto"
            disabled={!!busy}
            onClick={() => act("clear_image")}
          >
            Remove image
          </Button>
        )}
        <Button variant="ghost" className="w-full sm:w-auto" disabled={!!busy} onClick={remove}>
          Delete
        </Button>
      </div>

      {message && (
        <p className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-zinc-300">
          {message}
        </p>
      )}

      <div className="rounded-xl border border-teal-500/20 bg-gradient-to-br from-teal-500/[0.08] to-transparent px-3.5 py-3 text-xs leading-relaxed text-teal-100/90">
        <strong className="text-teal-200">Same idea, two formats.</strong> Post the LinkedIn copy
        as one long post. On X, paste each chunk as its own tweet (thread). DevPulse never calls
        social write APIs.
      </div>
    </div>
  );
}

/** Helper for server components to pass dual content into PostActions. */
export function dualFromPost(post: {
  content: string;
  contentLinkedIn?: string | null;
  threadJson?: string | null;
  platform?: string | null;
}) {
  return resolveDualContent(post);
}
