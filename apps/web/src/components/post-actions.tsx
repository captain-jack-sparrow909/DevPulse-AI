"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function PostActions({
  postId,
  status,
  initialContent,
  imagePath,
  platform,
}: {
  postId: string;
  status: string;
  initialContent: string;
  imagePath?: string | null;
  platform: string;
}) {
  const router = useRouter();
  const [content, setContent] = useState(initialContent);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);

  async function act(action: string, extra?: Record<string, unknown>) {
    setBusy(action);
    setMessage("");
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, content, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || "Action failed");
      } else if (data.policy?.message) {
        setMessage(data.policy.message);
      } else {
        setMessage("Saved");
      }
      router.refresh();
    } catch {
      setMessage("Network error");
    } finally {
      setBusy(null);
    }
  }

  async function copyForManualPost() {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setMessage(
        imagePath
          ? "Text copied. Download the screenshot below and attach it when you post on " +
              (platform === "x" ? "X" : "LinkedIn") +
              "."
          : "Text copied. Paste into " +
              (platform === "x" ? "X" : "LinkedIn") +
              " and post manually.",
      );
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage("Could not copy — select the text manually");
    }
  }

  async function remove() {
    if (!confirm("Delete this post?")) return;
    setBusy("delete");
    await fetch(`/api/posts/${postId}`, { method: "DELETE" });
    router.push("/posts");
    router.refresh();
  }

  const canApprove = ["draft", "pending_review"].includes(status);
  const canReady = ["approved", "scheduled", "pending_review"].includes(status);
  const canMarkPosted = ["ready", "scheduled", "approved"].includes(status);

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs font-medium text-zinc-400">Content (editable)</label>
        <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={12} />
        <p className="mt-1 text-xs text-zinc-500">{content.length} characters</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!!busy} onClick={() => act("save")}>
          {busy === "save" ? "Saving…" : "Save edits"}
        </Button>
        <Button variant="outline" disabled={!!busy} onClick={copyForManualPost}>
          {copied ? "Copied!" : "Copy for manual post"}
        </Button>
        {canApprove && (
          <>
            <Button disabled={!!busy} onClick={() => act("approve")}>
              {busy === "approve" ? "…" : "Approve for slot"}
            </Button>
            <Button
              variant="danger"
              disabled={!!busy}
              onClick={() => act("reject", { rejectionReason: "Rejected by user" })}
            >
              Reject
            </Button>
          </>
        )}
        {canReady && status !== "ready" && (
          <Button variant="secondary" disabled={!!busy} onClick={() => act("mark_ready")}>
            {busy === "mark_ready" ? "…" : "Mark ready now"}
          </Button>
        )}
        {canMarkPosted && (
          <Button disabled={!!busy} onClick={() => act("mark_posted")}>
            {busy === "mark_posted" ? "…" : "I posted this manually"}
          </Button>
        )}
        <Button
          variant="ghost"
          disabled={!!busy}
          onClick={() => act("recapture_image")}
        >
          {busy === "recapture_image" ? "Capturing…" : "Recapture screenshot"}
        </Button>
        {imagePath && (
          <Button variant="ghost" disabled={!!busy} onClick={() => act("clear_image")}>
            Remove image
          </Button>
        )}
        <Button variant="ghost" disabled={!!busy} onClick={remove}>
          Delete
        </Button>
      </div>

      {message && (
        <p className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 text-sm text-zinc-300">
          {message}
        </p>
      )}

      <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-xs text-cyan-100/90">
        <strong className="text-cyan-200">Manual posting only.</strong> DevPulse never posts to X or
        LinkedIn APIs. When a slot is ready: copy text → attach screenshot if present → post yourself →
        click &quot;I posted this manually&quot;.
      </div>
    </div>
  );
}
