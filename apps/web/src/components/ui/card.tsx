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
        "relative rounded-[1.35rem] border border-slate-300/[0.09] bg-[linear-gradient(145deg,rgba(15,21,33,0.88),rgba(7,10,17,0.84))] shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_24px_64px_-42px_rgba(0,0,0,0.95)] backdrop-blur-xl transition-[border-color,box-shadow,transform] duration-200 hover:border-slate-300/[0.14]",
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
    <div className={cn("flex flex-col gap-1 border-b border-slate-300/[0.07] p-4 pb-3 sm:p-5 sm:pb-4", className)}>
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
    <h3 className={cn("text-[0.95rem] font-semibold tracking-[-0.015em] text-slate-50", className)}>
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
  return <p className={cn("text-sm leading-relaxed text-slate-400", className)}>{children}</p>;
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
