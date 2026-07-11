"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Compact clipboard control for headings and per-chunk copy.
 */
export function CopyIconButton({
  text,
  label = "Copy to clipboard",
  className,
  onCopied,
}: {
  text: string;
  label?: string;
  className?: string;
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: { preventDefault: () => void; stopPropagation: () => void }) {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* parent can fall back if needed */
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied" : label}
      aria-label={copied ? "Copied" : label}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:border-teal-400/30 hover:bg-teal-500/10 hover:text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/40",
        copied && "border-emerald-400/30 bg-emerald-500/10 text-emerald-300",
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}
