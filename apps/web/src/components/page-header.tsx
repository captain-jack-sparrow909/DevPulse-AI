import { cn } from "@/lib/utils";

export function PageHeader({
  kicker,
  title,
  description,
  actions,
  className,
}: {
  kicker?: string;
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative flex flex-col gap-4 overflow-hidden rounded-[1.65rem] border border-slate-300/[0.08] bg-[linear-gradient(125deg,rgba(14,24,35,0.76),rgba(7,10,18,0.52)_58%,rgba(35,25,67,0.26))] px-5 py-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_28px_80px_-60px_rgba(69,230,208,0.45)] sm:flex-row sm:items-end sm:justify-between sm:px-6 sm:py-6",
        className,
      )}
    >
      <div aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-teal-300/70 to-transparent" />
      <div aria-hidden className="pointer-events-none absolute -right-12 -top-20 h-48 w-48 rounded-full border border-violet-300/10 bg-violet-400/[0.035]" />
      <div className="relative min-w-0">
        {kicker && <div className="page-kicker mb-2">{kicker}</div>}
        <h1 className="page-title">{title}</h1>
        {description && <div className="page-subtitle">{description}</div>}
      </div>
      {actions && (
        <div className="relative flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
          {actions}
        </div>
      )}
    </div>
  );
}
