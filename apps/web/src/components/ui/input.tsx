import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        "flex h-11 w-full rounded-xl border border-slate-300/[0.11] bg-[#050810]/70 px-3.5 py-2 text-sm text-slate-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_10px_30px_-24px_rgba(0,0,0,0.9)] placeholder:text-slate-600 transition focus-visible:border-teal-300/45 focus-visible:bg-[#070c15] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300/15 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Input.displayName = "Input";
