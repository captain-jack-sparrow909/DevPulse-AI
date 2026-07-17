import { Activity } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[13px] border border-teal-300/25 bg-[linear-gradient(145deg,rgba(69,230,208,0.18),rgba(124,92,246,0.1))] text-teal-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_0_28px_-12px_rgba(69,230,208,0.8)]",
        className,
      )}
    >
      <span className="absolute inset-[5px] rounded-[9px] border border-white/[0.06]" />
      <Activity className="relative h-[18px] w-[18px]" strokeWidth={1.8} />
      <span className="orbit-pulse absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-teal-300" />
    </div>
  );
}
