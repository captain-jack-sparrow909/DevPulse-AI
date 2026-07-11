import * as React from "react";
import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "flex min-h-[100px] w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm leading-relaxed text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] placeholder:text-zinc-600 focus-visible:border-teal-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/25 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";
