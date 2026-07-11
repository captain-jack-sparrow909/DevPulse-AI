import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-white/[0.07] bg-[rgba(14,16,22,0.75)] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_12px_40px_-24px_rgba(0,0,0,0.8)] backdrop-blur-md",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1 border-b border-white/[0.05] p-4 pb-3 sm:p-5 sm:pb-3.5", className)}>
      {children}
    </div>
  );
}

export function CardTitle({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <h3 className={cn("text-[0.95rem] font-semibold tracking-tight text-zinc-50", className)}>
      {children}
    </h3>
  );
}

export function CardDescription({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <p className={cn("text-sm leading-relaxed text-zinc-500", className)}>{children}</p>;
}

export function CardContent({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <div className={cn("p-4 pt-4 sm:p-5 sm:pt-4", className)}>{children}</div>;
}
