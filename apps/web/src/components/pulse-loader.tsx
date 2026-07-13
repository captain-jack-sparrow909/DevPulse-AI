import { cn } from "@/lib/utils";

/**
 * Brand loader — concentric pulse rings (matches DevPulse favicon motif).
 */
export function PulseLoader({
  label = "Gathering signal…",
  className,
  size = "md",
}: {
  label?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "sm" ? "h-10 w-10" : size === "lg" ? "h-16 w-16" : "h-12 w-12";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 text-center",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className={cn("relative", dim)}>
        <span className="pulse-ring pulse-ring-outer absolute inset-0 rounded-full border border-teal-400/25" />
        <span className="pulse-ring pulse-ring-mid absolute inset-[18%] rounded-full border border-teal-400/45" />
        <span className="pulse-core absolute inset-[36%] rounded-full bg-gradient-to-br from-teal-300 to-teal-500 shadow-[0_0_20px_rgba(45,212,191,0.55)]" />
      </div>
      {label ? (
        <p className="text-xs font-medium tracking-wide text-zinc-400">
          <span className="text-teal-300/90">{label}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Full-area route / section loading shell */
export function RouteLoadingPanel({
  label = "Loading…",
}: {
  label?: string;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-4 py-16">
      <PulseLoader label={label} size="lg" />
      <p className="mt-3 max-w-xs text-center text-[11px] leading-relaxed text-zinc-600">
        Research-first studio · preparing your next view
      </p>
    </div>
  );
}
