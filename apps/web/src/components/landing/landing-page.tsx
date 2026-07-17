import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  FileCheck2,
  Fingerprint,
  GitBranch,
  Layers3,
  LineChart,
  LockKeyhole,
  Orbit,
  Radar,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { LandingHeader } from "@/components/landing/landing-header";

const SIGNALS = [
  { source: "PROJECT", title: "IntelliTab · native IPC architecture", score: "9.2", color: "text-teal-300" },
  { source: "GITHUB", title: "Meaningful repository change detected", score: "8.8", color: "text-violet-300" },
  { source: "AUDIENCE", title: "Question pattern worth answering", score: "8.1", color: "text-amber-200" },
] as const;

const WORKFLOW = [
  { icon: GitBranch, step: "01", title: "Observe the build", body: "Project facts, repository changes, and audience questions become durable source evidence." },
  { icon: ScanSearch, step: "02", title: "Find the sharp angle", body: "Relevance, novelty, and product strategy rank ideas before a model writes anything." },
  { icon: FileCheck2, step: "03", title: "Earn the publish window", body: "Platform-native drafts pass grounding, quality, repetition, and cooldown gates." },
  { icon: LineChart, step: "04", title: "Learn from outcomes", body: "Manual performance checkpoints turn publishing into a measurable operating loop." },
] as const;

const PRINCIPLES = [
  { icon: Fingerprint, title: "Your product voice", body: "Owned-project evidence stays at the center. DevPulse amplifies your engineering judgment instead of impersonating a generic creator." },
  { icon: ShieldCheck, title: "Grounded by design", body: "Claims remain attached to verified facts and source URLs. Unsupported narratives are removed before scoring." },
  { icon: LockKeyhole, title: "Human at the boundary", body: "The system prepares, ranks, and measures. You approve and publish every post manually." },
] as const;

function SignalConsole() {
  return (
    <div className="relative mx-auto w-full max-w-[650px] lg:mx-0">
      <div aria-hidden className="absolute -inset-16 rounded-full bg-[radial-gradient(circle,rgba(69,230,208,0.14),transparent_58%)] blur-2xl" />
      <div aria-hidden className="absolute -right-8 -top-8 h-44 w-44 rounded-full border border-violet-300/10" />
      <div aria-hidden className="absolute -right-1 top-10 h-28 w-28 rounded-full border border-dashed border-teal-300/15" />

      <div className="tech-panel relative overflow-hidden rounded-[1.65rem]">
        <div aria-hidden className="scan-line absolute inset-x-0 top-0 z-10 h-24 bg-gradient-to-b from-transparent via-teal-300/[0.035] to-transparent" />
        <div className="flex items-center justify-between border-b border-slate-300/[0.08] px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-400/60" />
            <span className="h-2 w-2 rounded-full bg-amber-300/60" />
            <span className="h-2 w-2 rounded-full bg-emerald-300/70" />
            <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.18em] text-slate-600 sm:text-[10px]">DEVPLS / SIGNAL ENGINE</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2 py-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.8)]" /> Live
          </div>
        </div>

        <div className="grid min-h-[460px] md:grid-cols-[0.88fr_1.12fr]">
          <div className="border-b border-slate-300/[0.07] p-4 md:border-b-0 md:border-r sm:p-5">
            <div className="flex items-center justify-between">
              <div><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-600">Incoming signal</p><p className="mt-1 text-sm font-medium text-slate-200">Product intelligence</p></div>
              <Radar className="h-4 w-4 text-teal-300" />
            </div>
            <div className="mt-5 space-y-2.5">
              {SIGNALS.map((signal, index) => (
                <div key={signal.title} className="relative overflow-hidden rounded-xl border border-slate-300/[0.08] bg-[#070b13]/70 p-3 transition hover:border-teal-300/20">
                  {index === 0 ? <div className="absolute inset-y-0 left-0 w-0.5 bg-teal-300 shadow-[0_0_14px_rgba(69,230,208,0.9)]" /> : null}
                  <div className="flex items-center justify-between gap-2"><span className={`font-mono text-[8px] font-semibold tracking-[0.16em] ${signal.color}`}>{signal.source}</span><span className="font-mono text-[9px] text-slate-600">{signal.score}</span></div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-300">{signal.title}</p>
                  <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/[0.04]"><div className="h-full bg-gradient-to-r from-teal-300/70 to-violet-400/60" style={{ width: index === 0 ? "92%" : index === 1 ? "78%" : "64%" }} /></div>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[['63','signals'],['7','relevant'],['1','selected']].map(([value,label]) => <div key={label} className="rounded-lg border border-slate-300/[0.06] bg-white/[0.018] p-2 text-center"><p className="font-mono text-sm text-slate-200">{value}</p><p className="text-[8px] uppercase tracking-wider text-slate-600">{label}</p></div>)}
            </div>
          </div>

          <div className="flex flex-col p-4 sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-violet-300/80">Ranked opportunity</p><h3 className="mt-2 text-base font-semibold tracking-tight text-slate-50">A local AI tool doesn&apos;t need an HTTP server.</h3></div>
              <div className="rounded-xl border border-teal-300/15 bg-teal-300/[0.07] px-2.5 py-2 text-center"><p className="font-mono text-sm font-semibold text-teal-200">8.7</p><p className="text-[7px] uppercase tracking-wider text-teal-300/60">quality</p></div>
            </div>
            <div className="mt-4 rounded-xl border border-slate-300/[0.08] bg-[#050810]/80 p-4 shadow-inner">
              <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.12em] text-slate-500"><TerminalSquare className="h-3.5 w-3.5 text-teal-300" /> X thread · 3 posts</div>
              <p className="mt-3 text-[12px] leading-5 text-slate-300">IntelliTab skips the REST layer entirely. Length-prefixed JSON connects TypeScript directly to a persistent Python MLX process.</p>
              <p className="mt-2 text-[12px] leading-5 text-slate-400">For single-user local inference, native IPC keeps the completion path focused.</p>
              <div className="mt-4 flex flex-wrap gap-1.5"><span className="rounded-md bg-teal-300/[0.07] px-2 py-1 text-[8px] text-teal-200">grounded</span><span className="rounded-md bg-violet-300/[0.07] px-2 py-1 text-[8px] text-violet-200">novel angle</span><span className="rounded-md bg-white/[0.035] px-2 py-1 text-[8px] text-slate-400">manual review</span></div>
            </div>
            <div className="mt-auto pt-5">
              <div className="flex items-center justify-between text-[9px] uppercase tracking-wider text-slate-600"><span>Publishing confidence</span><span className="text-teal-300">High</span></div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full w-[86%] rounded-full bg-gradient-to-r from-teal-300 via-cyan-300 to-violet-400 shadow-[0_0_12px_rgba(69,230,208,0.45)]" /></div>
              <div className="mt-4 flex items-center justify-between"><div className="flex items-center gap-2 text-[10px] text-slate-500"><Clock3 className="h-3.5 w-3.5" /> Next window · 18:00</div><span className="rounded-lg border border-teal-300/20 bg-teal-300/[0.08] px-2.5 py-1.5 text-[9px] font-semibold text-teal-200">READY FOR YOU</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="float-soft absolute -bottom-7 -left-4 hidden items-center gap-3 rounded-2xl border border-slate-300/[0.1] bg-[#0b101b]/95 px-3.5 py-3 shadow-2xl backdrop-blur-xl sm:flex">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-400/10 text-violet-300"><TrendingUp className="h-4 w-4" /></div>
        <div><p className="text-[9px] uppercase tracking-wider text-slate-600">Learning loop</p><p className="mt-0.5 text-xs font-medium text-slate-200">Metrics become next week&apos;s strategy</p></div>
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="landing relative min-h-screen overflow-x-hidden text-slate-100">
      <div aria-hidden className="landing-grid pointer-events-none absolute inset-x-0 top-0 h-[920px] opacity-70" />
      <div aria-hidden className="pointer-events-none absolute left-1/2 top-16 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full border border-teal-300/[0.035]" />
      <LandingHeader />

      <main className="relative z-10">
        <section className="mx-auto max-w-7xl px-4 pb-20 pt-14 sm:px-6 sm:pt-20 lg:px-8 lg:pb-32 lg:pt-28">
          <div className="grid items-center gap-16 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14 xl:gap-20">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-teal-300/15 bg-teal-300/[0.055] px-3 py-1.5 font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-teal-200 sm:text-[10px]">
                <Activity className="h-3.5 w-3.5" /> Product intelligence for technical creators
              </div>
              <h1 className="mt-7 max-w-2xl text-[2.65rem] font-semibold leading-[0.98] tracking-[-0.06em] text-white sm:text-6xl lg:text-[4.35rem] xl:text-[4.85rem]">
                Turn what you build into <span className="gradient-text">signal people follow.</span>
              </h1>
              <p className="mt-7 max-w-xl text-base leading-7 text-slate-400 sm:text-lg sm:leading-8">
                DevPulse transforms real product decisions, repository changes, and audience questions into grounded X and LinkedIn content—then learns what actually grows your reputation.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link href="/register" className="group inline-flex items-center justify-center gap-2 rounded-xl border border-teal-200/20 bg-[linear-gradient(110deg,#42e2cc,#70ead7)] px-5 py-3.5 text-sm font-semibold text-[#04110f] shadow-[0_16px_40px_-18px_rgba(69,230,208,0.9)] transition hover:-translate-y-0.5 hover:brightness-110">
                  Build your signal engine <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a href="#platform" className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300/[0.12] bg-slate-200/[0.045] px-5 py-3.5 text-sm font-medium text-slate-200 transition hover:-translate-y-0.5 hover:border-violet-300/25 hover:bg-violet-300/[0.055]">Explore the platform <ChevronRight className="h-4 w-4 text-slate-500" /></a>
              </div>
              <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 border-t border-slate-300/[0.08] pt-6 text-[11px] text-slate-500">
                {["Grounded in your work", "Platform-native writing", "Human-approved publishing"].map((item) => <span key={item} className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-teal-300" />{item}</span>)}
              </div>
            </div>
            <SignalConsole />
          </div>
        </section>

        <section className="border-y border-slate-300/[0.07] bg-[#070a11]/60">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-600">Built on a production-grade stack</p>
            <div className="flex flex-wrap gap-x-6 gap-y-3 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">{["Next.js", "Postgres", "DeepSeek", "Playwright", "Cloudflare R2", "Vercel"].map((item) => <span key={item}>{item}</span>)}</div>
          </div>
        </section>

        <section id="platform" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-32">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
            <div><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300">One connected system</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-slate-50 sm:text-5xl">From build log to growth loop.</h2></div>
            <p className="max-w-2xl text-base leading-7 text-slate-400 lg:justify-self-end">Most content tools begin at the cursor. DevPulse begins upstream—with the work, evidence, and decisions that make your perspective worth following.</p>
          </div>

          <div className="mt-12 grid gap-4 lg:grid-cols-12">
            <article className="tech-panel relative overflow-hidden rounded-[1.5rem] p-6 lg:col-span-7 lg:p-8">
              <div aria-hidden className="absolute -right-20 -top-20 h-64 w-64 rounded-full border border-teal-300/10 bg-teal-300/[0.025]" />
              <div className="relative flex h-full flex-col"><div className="flex items-center justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-teal-300/15 bg-teal-300/[0.07] text-teal-200"><Radar className="h-5 w-5" /></div><span className="font-mono text-[9px] uppercase tracking-[0.18em] text-teal-300/60">Project memory</span></div><h3 className="mt-7 max-w-md text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">Your products become a living source of content truth.</h3><p className="mt-3 max-w-xl text-sm leading-6 text-slate-400">Repository changes, verified project facts, campaign goals, and audience signals stay connected—so each draft can be specific without inventing a backstory.</p><div className="mt-8 grid grid-cols-3 gap-2 sm:max-w-lg">{[["03","products"],["24","fact cards"],["100%","traceable"]].map(([value,label]) => <div key={label} className="rounded-xl border border-slate-300/[0.07] bg-black/20 p-3"><p className="font-mono text-lg text-slate-100">{value}</p><p className="mt-1 text-[9px] uppercase tracking-wider text-slate-600">{label}</p></div>)}</div></div>
            </article>

            <article className="tech-panel relative overflow-hidden rounded-[1.5rem] p-6 lg:col-span-5 lg:p-8">
              <div className="flex items-center justify-between"><div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-300/15 bg-violet-300/[0.07] text-violet-200"><BarChart3 className="h-5 w-5" /></div><span className="font-mono text-[9px] uppercase tracking-[0.18em] text-violet-300/60">Decision layer</span></div>
              <h3 className="mt-7 text-2xl font-semibold tracking-tight text-slate-50">Publish less. Learn faster.</h3><p className="mt-3 text-sm leading-6 text-slate-400">Quality, novelty, project cooldowns, and platform cadence decide what earns attention—not a quota that must be filled.</p>
              <div className="mt-8 space-y-3">{[["Grounding","100%"],["Novelty","87%"],["Hook strength","82%"]].map(([label,value],i) => <div key={label}><div className="flex justify-between text-[10px] text-slate-500"><span>{label}</span><span className="font-mono text-slate-300">{value}</span></div><div className="mt-1.5 h-1 rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-teal-300" style={{width:i===0?'100%':i===1?'87%':'82%'}} /></div></div>)}</div>
            </article>

            <article className="tech-panel relative rounded-[1.5rem] p-6 lg:col-span-4 lg:p-8"><div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.07] text-cyan-200"><Layers3 className="h-5 w-5" /></div><h3 className="mt-6 text-xl font-semibold text-slate-50">Platform-native packs</h3><p className="mt-3 text-sm leading-6 text-slate-400">One idea becomes a concise X thread and a deeper LinkedIn narrative—not duplicated copy.</p><div className="mt-7 flex gap-2"><span className="rounded-lg border border-slate-300/[0.08] bg-white/[0.025] px-3 py-2 font-mono text-[9px] text-slate-400">X / THREAD</span><span className="rounded-lg border border-slate-300/[0.08] bg-white/[0.025] px-3 py-2 font-mono text-[9px] text-slate-400">IN / STORY</span></div></article>
            <article className="tech-panel relative rounded-[1.5rem] p-6 lg:col-span-4 lg:p-8"><div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-300/15 bg-amber-300/[0.07] text-amber-200"><Sparkles className="h-5 w-5" /></div><h3 className="mt-6 text-xl font-semibold text-slate-50">Visual content studio</h3><p className="mt-3 text-sm leading-6 text-slate-400">Grounded technical cards and carousels carry your brand across both feeds.</p><div className="mt-7 grid grid-cols-3 gap-2">{["PNG","PDF","R2"].map((x) => <span key={x} className="rounded-lg border border-slate-300/[0.08] bg-white/[0.025] px-2 py-2 text-center font-mono text-[9px] text-slate-400">{x}</span>)}</div></article>
            <article className="tech-panel relative rounded-[1.5rem] p-6 lg:col-span-4 lg:p-8"><div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.07] text-emerald-200"><TrendingUp className="h-5 w-5" /></div><h3 className="mt-6 text-xl font-semibold text-slate-50">Measured growth</h3><p className="mt-3 text-sm leading-6 text-slate-400">Follower checkpoints, experiments, attribution, and 30-day validation keep recommendations honest.</p><div className="mt-7 flex items-end gap-1.5">{[28,42,36,58,52,74,86].map((h,i) => <span key={i} className="flex-1 rounded-sm bg-gradient-to-t from-emerald-400/20 to-teal-300/70" style={{height:`${h}px`}} />)}</div></article>
          </div>
        </section>

        <section id="workflow" className="border-y border-slate-300/[0.07] bg-[#070a11]/58">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
            <div className="max-w-2xl"><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-300">The operating loop</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-slate-50 sm:text-5xl">A repeatable system, not a content slot machine.</h2></div>
            <ol className="relative mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div aria-hidden className="signal-line absolute left-[10%] right-[10%] top-7 hidden h-px lg:block" />
              {WORKFLOW.map((item) => { const Icon=item.icon; return <li key={item.step} className="tech-panel relative rounded-[1.35rem] p-5"><div className="relative flex items-center justify-between"><div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-teal-300/15 bg-[#08121a] text-teal-200 shadow-[0_0_24px_-12px_rgba(69,230,208,0.8)]"><Icon className="h-5 w-5" /></div><span className="font-mono text-[10px] text-slate-600">{item.step}</span></div><h3 className="relative mt-6 text-base font-semibold text-slate-100">{item.title}</h3><p className="relative mt-2 text-sm leading-6 text-slate-500">{item.body}</p></li>; })}
            </ol>
          </div>
        </section>

        <section id="intelligence" className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:px-8 lg:py-32">
          <div><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300">Compounding intelligence</p><h2 className="mt-4 text-3xl font-semibold tracking-[-0.045em] text-slate-50 sm:text-5xl">Every post makes the next decision smarter.</h2><p className="mt-5 max-w-xl text-base leading-7 text-slate-400">DevPulse connects creation, distribution, measurement, and review. You can see why an idea was selected, what shipped, and whether the audience cared.</p><div className="mt-8 grid gap-3 sm:grid-cols-2">{[[Users,"Audience signals"],[Orbit,"Experiments"],[TrendingUp,"Growth reviews"],[Zap,"Adaptive cadence"]].map(([Icon,label]) => { const C=Icon as typeof Users; return <div key={label as string} className="flex items-center gap-3 rounded-xl border border-slate-300/[0.08] bg-slate-200/[0.025] p-3 text-sm text-slate-300"><C className="h-4 w-4 text-teal-300" />{label as string}</div>; })}</div></div>
          <div className="tech-panel relative overflow-hidden rounded-[1.75rem] p-5 sm:p-8"><div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-violet-300/10 bg-violet-300/[0.025]" /><div className="relative flex items-center justify-between"><div><p className="font-mono text-[9px] uppercase tracking-[0.18em] text-slate-600">30-day validation</p><p className="mt-1 text-lg font-semibold text-slate-100">Growth signal dashboard</p></div><span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-300">Active</span></div><div className="relative mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">{[["17","days"],["82%","coverage"],["+14","followers"],["3.8%","engagement"]].map(([value,label]) => <div key={label} className="rounded-xl border border-slate-300/[0.07] bg-black/20 p-3"><p className="font-mono text-xl text-slate-100">{value}</p><p className="mt-1 text-[9px] uppercase tracking-wider text-slate-600">{label}</p></div>)}</div><div className="relative mt-6 rounded-xl border border-teal-300/[0.1] bg-teal-300/[0.035] p-4"><div className="flex items-start gap-3"><CircleDot className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" /><div><p className="text-sm font-medium text-teal-100">Keep the current quality gate</p><p className="mt-1 text-xs leading-5 text-slate-400">Engagement improved with sufficient sample size. Preserve cadence for the next window.</p></div></div></div></div>
        </section>

        <section id="principles" className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8 lg:pb-32"><div className="grid gap-4 lg:grid-cols-3">{PRINCIPLES.map((item)=>{const Icon=item.icon;return <article key={item.title} className="group rounded-[1.4rem] border border-slate-300/[0.08] bg-[linear-gradient(145deg,rgba(14,20,31,0.66),rgba(6,9,15,0.78))] p-6 transition hover:-translate-y-1 hover:border-teal-300/20"><Icon className="h-5 w-5 text-teal-300" /><h3 className="mt-5 text-lg font-semibold text-slate-100">{item.title}</h3><p className="mt-2 text-sm leading-6 text-slate-500">{item.body}</p></article>})}</div></section>

        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28"><div className="relative overflow-hidden rounded-[2rem] border border-teal-300/15 bg-[linear-gradient(125deg,rgba(20,52,55,0.78),rgba(10,15,27,0.94)_48%,rgba(47,32,82,0.7))] px-6 py-12 shadow-[0_40px_100px_-55px_rgba(69,230,208,0.55)] sm:px-10 lg:px-14 lg:py-16"><div aria-hidden className="absolute -right-20 -top-40 h-96 w-96 rounded-full border border-violet-200/10 bg-violet-300/[0.04]" /><div aria-hidden className="absolute bottom-0 left-0 h-px w-2/3 bg-gradient-to-r from-teal-300/70 to-transparent" /><div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center"><div><p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-200">Your work is already the content</p><h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-[-0.045em] text-white sm:text-5xl">Build the reputation layer around what you ship.</h2><p className="mt-4 max-w-2xl text-base leading-7 text-slate-300/80">Start with your projects. Keep human judgment. Let the evidence compound.</p></div><Link href="/register" className="group inline-flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-5 py-3.5 text-sm font-semibold text-slate-950 shadow-xl transition hover:-translate-y-0.5 hover:bg-white">Open your workspace <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" /></Link></div></div></section>
      </main>

      <footer className="relative z-10 border-t border-slate-300/[0.07] bg-[#05070c]/80"><div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8"><div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg border border-teal-300/15 bg-teal-300/[0.06] text-teal-200"><Code2 className="h-4 w-4" /></div><div><p className="text-sm font-semibold text-slate-200">DevPulse AI</p><p className="text-[10px] text-slate-600">Product intelligence for engineers who build in public.</p></div></div><div className="flex items-center gap-5 text-xs text-slate-500"><Link href="/login" className="hover:text-slate-200">Sign in</Link><Link href="/register" className="hover:text-slate-200">Create account</Link><span>© {new Date().getFullYear()}</span></div></div></footer>
    </div>
  );
}
