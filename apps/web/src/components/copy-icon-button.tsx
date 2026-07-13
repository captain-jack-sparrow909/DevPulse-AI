"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { copyToClipboard } from "@/lib/clipboard";

/**
 * Compact clipboard control for headings and per-chunk copy.
 * Uses an iOS-safe copy helper (Clipboard API + execCommand fallback).
 */
export function CopyIconButton({
  text,
  label = "Copy to clipboard",
  className,
  onCopied,
  onFailed,
}: {
  text: string;
  label?: string;
  className?: string;
  onCopied?: () => void;
  onFailed?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(true);
      setFailed(false);
      onCopied?.();
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      setFailed(true);
      onFailed?.();
      window.setTimeout(() => setFailed(false), 2200);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={failed ? "Copy failed" : copied ? "Copied" : label}
      aria-label={failed ? "Copy failed" : copied ? "Copied" : label}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:border-teal-400/30 hover:bg-teal-500/10 hover:text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40 active:scale-95",
        copied && "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
        failed && "border-rose-400/30 bg-rose-500/10 text-rose-300",
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
