import Link from "next/link";
import { ArrowLeft, Check, GitBranch, ShieldCheck, Sparkles } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <main className="relative min-h-dvh overflow-hidden bg-[#05070c]">
      <div aria-hidden className="landing-grid pointer-events-none absolute inset-0 opacity-70" />
      <div aria-hidden className="pointer-events-none absolute -left-32 -top-32 h-[34rem] w-[34rem] rounded-full bg-teal-400/[0.08] blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-48 -right-32 h-[38rem] w-[38rem] rounded-full bg-violet-500/[0.09] blur-3xl" />

      <div className="relative mx-auto grid min-h-dvh max-w-7xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden border-r border-slate-300/[0.07] px-10 py-12 lg:flex lg:flex-col xl:px-16">
          <Link href="/" className="flex items-center gap-3 self-start">
            <BrandMark />
            <div><p className="text-sm font-semibold text-slate-100">DevPulse AI</p><p className="text-[10px] text-slate-600">Signal-to-growth OS</p></div>
          </Link>
          <div className="my-auto max-w-xl py-16">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300">Built around your work</p>
            <h2 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-[-0.05em] text-slate-50 xl:text-5xl">Your product decisions are already worth following.</h2>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-400">Turn verified engineering progress into a consistent public narrative—without sacrificing your voice or automating your reputation.</p>
            <div className="mt-9 space-y-3">
              {["Project facts stay traceable", "X and LinkedIn get native formats", "Every publish remains your decision"].map((item) => <div key={item} className="flex items-center gap-3 text-sm text-slate-300"><span className="flex h-6 w-6 items-center justify-center rounded-full border border-teal-300/15 bg-teal-300/[0.06]"><Check className="h-3 w-3 text-teal-300" /></span>{item}</div>)}
            </div>
            <div className="tech-panel relative mt-10 max-w-lg overflow-hidden rounded-2xl p-4">
              <div className="flex items-center justify-between border-b border-slate-300/[0.07] pb-3"><span className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-600">Workspace preview</span><span className="flex items-center gap-1.5 text-[9px] text-emerald-300"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />ready</span></div>
              <div className="mt-4 grid grid-cols-3 gap-2">{[[GitBranch,"Project"],[Sparkles,"Draft"],[ShieldCheck,"Approve"]].map(([Icon,label]) => {const I=Icon as typeof GitBranch;return <div key={label as string} className="rounded-xl border border-slate-300/[0.07] bg-black/20 p-3"><I className="h-4 w-4 text-teal-300" /><p className="mt-3 text-[10px] text-slate-400">{label as string}</p></div>})}</div>
            </div>
          </div>
          <p className="text-[10px] text-slate-700">Private workspace · manual publishing · evidence-first</p>
        </section>

        <section className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-8 lg:px-12">
          <div className="w-full max-w-md">
            <Link href="/" className="mb-7 inline-flex items-center gap-2 text-xs text-slate-500 transition hover:text-teal-200 lg:hidden"><ArrowLeft className="h-3.5 w-3.5" /> Back to DevPulse</Link>
            <div className="mb-7 lg:hidden"><BrandMark /></div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-teal-300">{eyebrow}</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-slate-50">{title}</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">{description}</p>
            <div className="tech-panel relative mt-7 rounded-[1.5rem] p-5 sm:p-6">{children}</div>
            <div className="mt-5 text-center text-sm text-slate-500">{footer}</div>
          </div>
        </section>
      </div>
    </main>
  );
}
