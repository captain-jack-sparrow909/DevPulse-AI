import { cn } from "@/lib/utils";

export function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-slate-300/[0.11] bg-slate-200/[0.055] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
