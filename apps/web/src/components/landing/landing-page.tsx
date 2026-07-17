import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Clock3,
  GitBranch,
  Layers,
  Radar,
  ShieldCheck,
  Sparkles,
  Terminal,
} from "lucide-react";
import { LandingHeader } from "@/components/landing/landing-header";

const PIPELINE = [
  {
    step: "01",
    title: "Start from your products",
    body: "Owned-project facts first, with narrowly relevant external evidence only when the post type needs it.",
  },
  {
    step: "02",
    title: "Rank for your stack",
    body: "Topics and weights you control. Signal is scored against what you actually write about.",
  },
  {
    step: "03",
    title: "Earn a publishing slot",
    body: "One or two adaptive daily windows. Weak, repetitive, or unsupported ideas are intentionally skipped.",
  },
  {
    step: "04",
    title: "Score, screenshot, hand off",
    body: "Quality gates, optional Playwright capture of the source, then you approve and post by hand.",
  },
] as const;

const PROOFS = [
  {
    icon: Radar,
    title: "Research-first, not prompt-first",
    body: "The system starts from public engineering feeds. Every draft carries internal citations back to a source URL.",
  },
  {
    icon: Clock3,
    title: "Selective cadence, not feed spam",
    body: "X and LinkedIn use separate quotas and measured timing. A quiet day is better than a forced post.",
  },
  {
    icon: ShieldCheck,
    title: "Human gate, always",
    body: "No silent publish. X and LinkedIn write APIs are intentionally unused—you copy, attach media, and ship yourself.",
  },
  {
    icon: Layers,
    title: "Built like production software",
    body: "Next.js, Prisma, Better Auth, typed pipeline, cron endpoint, versioned prompts. Portfolio-grade architecture, not a demo notebook.",
  },
] as const;

const STACK = [
  "Next.js",
  "TypeScript",
  "Prisma",
  "Better Auth",
  "DeepSeek",
  "Playwright",
  "Vercel Cron",
] as const;

const SLOTS = ["09:00", "18:00"] as const;

export function LandingPage() {
  return (
    <div className="landing relative min-h-screen overflow-x-hidden bg-[#07080a] text-zinc-100">
      {/* ambient light — restrained, not rainbow soup */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[720px] bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(45,212,191,0.14),transparent_55%),radial-gradient(ellipse_50%_40%_at_90%_10%,rgba(251,191,36,0.06),transparent_50%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35] [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]"
      />

      <LandingHeader />

      <main className="relative z-10">
        {/* HERO */}
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 sm:pb-20 sm:pt-12 lg:pb-28">
          <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
            <div>
              <div className="mb-5 inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-teal-300/90 sm:mb-6 sm:text-[11px] sm:tracking-[0.14em]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400 shadow-[0_0_12px_rgba(45,212,191,0.8)]" />
                <span className="truncate">Built for engineers who ship in public</span>
              </div>
              <h1 className="max-w-xl text-[1.85rem] font-semibold leading-[1.1] tracking-tight text-zinc-50 sm:text-[2.35rem] sm:leading-[1.08] md:text-5xl md:leading-[1.05]">
                Content that starts from{" "}
                <span className="bg-gradient-to-r from-teal-200 via-teal-100 to-amber-100/90 bg-clip-text text-transparent">
                  real engineering signal
                </span>
                —not a blank prompt.
              </h1>
              <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-zinc-400 sm:mt-6 sm:text-base sm:text-lg">
                DevPulse turns real lessons from the products you are building into senior-engineer
                posts for X and LinkedIn, supported by selective research. Only strong drafts earn a slot. You approve.
                You post. The feed stays honest.
              </p>
              <div className="mt-7 flex w-full flex-col gap-3 sm:mt-8 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center">
                <Link
                  href="/register"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-teal-400 px-5 py-3 text-sm font-semibold text-zinc-950 shadow-[0_0_40px_-12px_rgba(45,212,191,0.7)] transition hover:bg-teal-300 sm:w-auto"
                >
                  Create workspace
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#pipeline"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.06] sm:w-auto"
                >
                  See how it works
                </a>
              </div>
              <dl className="mt-8 grid max-w-md grid-cols-3 gap-2 border-t border-white/10 pt-6 sm:mt-10 sm:gap-4 sm:pt-8">
                {[
                  ["1–2", "draft windows / day"],
                  ["2", "platform cadences"],
                  ["0", "auto-publishes"],
                ].map(([value, label]) => (
                  <div key={label}>
                    <dt className="font-mono text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl">
                      {value}
                    </dt>
                    <dd className="mt-1 text-[10px] uppercase leading-tight tracking-wide text-zinc-500 sm:text-[11px]">
                      {label}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Product frame — CSS mock, not stock art */}
            <div className="relative">
              <div
                aria-hidden
                className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-teal-500/10 via-transparent to-amber-500/5 blur-2xl"
              />
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e12]/95 shadow-2xl shadow-black/50 backdrop-blur">
                <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                    <span className="h-2.5 w-2.5 rounded-full bg-zinc-700" />
                  </div>
                  <div className="font-mono text-[11px] text-zinc-500">slot · 14:12 · Asia/Dubai</div>
                  <div className="rounded-md border border-teal-500/20 bg-teal-500/10 px-2 py-0.5 text-[10px] font-medium text-teal-300">
                    due now
                  </div>
                </div>
                <div className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider text-zinc-500">
                        Live research
                      </div>
                      <div className="mt-1 text-sm font-medium text-zinc-100">
                        Projects first · targeted evidence
                      </div>
                    </div>
                    <div className="rounded-md bg-zinc-900 px-2 py-1 font-mono text-[10px] text-zinc-400">
                      run #47
                    </div>
                  </div>

                  <div className="space-y-2">
                    {[
                      { src: "github", title: "colibri — local GLM runtime", score: "92" },
                      { src: "arxiv", title: "Efficient tool-use for agents", score: "88" },
                      { src: "hn", title: "Show HN: ship logs that don’t lie", score: "81" },
                    ].map((row) => (
                      <div
                        key={row.title}
                        className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                      >
                        <span className="w-12 shrink-0 font-mono text-[10px] uppercase text-teal-400/90">
                          {row.src}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs text-zinc-300">
                          {row.title}
                        </span>
                        <span className="font-mono text-[10px] text-zinc-500">{row.score}</span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-amber-500/15 bg-gradient-to-b from-amber-500/[0.07] to-transparent p-4">
                    <div className="flex items-center gap-2 text-[11px] text-amber-200/80">
                      <Terminal className="h-3.5 w-3.5" />
                      Draft · LinkedIn · pending review
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-200">
                      Most teams debug agents by staring at the model. The bug is usually the loop:
                      unbounded retries, no request id, no idempotency. One log line would have saved
                      two days.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400">
                        score 8.6
                      </span>
                      <span className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400">
                        screenshot attached
                      </span>
                      <span className="rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-zinc-400">
                        manual post
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* PROBLEM */}
        <section id="problem" className="border-y border-white/[0.06] bg-black/20">
          <div className="mx-auto grid max-w-6xl gap-0 px-4 sm:px-6 md:grid-cols-2">
            <div className="border-b border-white/[0.06] py-10 sm:py-14 md:border-b-0 md:border-r md:pr-12">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-rose-300/70">
                The default path
              </div>
              <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-100">
                Prompt-first content is disposable.
              </h2>
              <ul className="mt-6 space-y-3 text-sm leading-relaxed text-zinc-400">
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400/60" />
                  Invented “trends” with no URL, no paper, no repo.
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400/60" />
                  Twelve posts written at dawn that ignore the day’s actual news.
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-rose-400/60" />
                  Auto-publish that trades reputation for volume.
                </li>
              </ul>
            </div>
            <div className="py-10 sm:py-14 md:pl-12">
              <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-teal-300/80">
                The DevPulse path
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">
                Research first. Then write. Then you decide.
              </h2>
              <ul className="mt-6 space-y-3 text-sm leading-relaxed text-zinc-400">
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400/70" />
                  Every angle is grounded in a fetched source and stored citation.
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400/70" />
                  Slot-time generation re-researches so 15:00 can reflect 14:00’s launch.
                </li>
                <li className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400/70" />
                  Manual post pack: copy, optional screenshot, mark posted. Nothing leaves without you.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* PIPELINE */}
        <section id="pipeline" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:py-28">
          <div className="max-w-2xl">
            <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
              Pipeline
            </div>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl md:text-4xl">
              A system you can explain in an interview.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-zinc-400">
              Not a chat wrapper. A scheduled, research-backed content factory with explicit human
              control—designed so the architecture is as legible as the posts it produces.
            </p>
          </div>

          <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {PIPELINE.map((item) => (
              <li
                key={item.step}
                className="group relative rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5 transition hover:border-teal-500/25 hover:bg-teal-500/[0.04]"
              >
                <div className="font-mono text-xs text-teal-400/80">{item.step}</div>
                <h3 className="mt-3 text-base font-semibold text-zinc-100">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-500">{item.body}</p>
              </li>
            ))}
          </ol>

          {/* Day ribbon */}
          <div className="mt-14 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b0d11]">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
              <div className="flex items-center gap-2 text-sm text-zinc-300">
                <Clock3 className="h-4 w-4 text-teal-400" />
                Adaptive publishing windows · Asia/Dubai
              </div>
              <div className="text-xs text-zinc-500">
                Cron ticks every ~15 min · weak drafts are skipped
              </div>
            </div>
            <div className="flex gap-2 overflow-x-auto p-4 [scrollbar-width:thin]">
              {SLOTS.map((t, i) => {
                const state = i === 0 ? "done" : "active";
                return (
                  <div
                    key={t}
                    className={`min-w-[4.5rem] flex-1 rounded-lg border px-2 py-3 text-center ${
                      state === "done"
                        ? "border-teal-500/20 bg-teal-500/10"
                        : state === "active"
                          ? "border-amber-400/40 bg-amber-400/10 shadow-[0_0_24px_-8px_rgba(251,191,36,0.5)]"
                          : "border-white/[0.06] bg-white/[0.02]"
                    }`}
                  >
                    <div className="font-mono text-[11px] text-zinc-300">{t}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-zinc-500">
                      {state === "done" ? "filled" : state === "active" ? "due" : "later"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SYSTEM / PROOF */}
        <section id="system" className="border-t border-white/[0.06] bg-black/25">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20 lg:py-28">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-xl">
                <div className="text-[11px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                  System design
                </div>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-50 sm:text-3xl md:text-4xl">
                  Details that survive a code review.
                </h2>
              </div>
              <p className="max-w-md text-sm leading-relaxed text-zinc-500">
                Built as a solo production tool with free-tier constraints in mind: SQLite or
                Supabase, DeepSeek for cost, Playwright for media, cron for cadence—no paid social
                write APIs required.
              </p>
            </div>

            <div id="proof" className="mt-12 grid gap-4 md:grid-cols-2">
              {PROOFS.map((item) => {
                const Icon = item.icon;
                return (
                  <article
                    key={item.title}
                    className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.03] to-transparent p-6"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-teal-300">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-zinc-100">{item.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-500">{item.body}</p>
                  </article>
                );
              })}
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-2">
              <span className="mr-2 text-xs uppercase tracking-wider text-zinc-600">Stack</span>
              {STACK.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 font-mono text-xs text-zinc-400"
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* CAPABILITIES STRIP */}
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-6 rounded-2xl border border-white/[0.08] bg-[linear-gradient(135deg,rgba(45,212,191,0.08),transparent_40%,rgba(251,191,36,0.05))] p-5 sm:rounded-3xl sm:p-8 md:p-10 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <div className="flex items-center gap-2 text-teal-300">
                <Sparkles className="h-4 w-4 shrink-0" />
                <span className="text-xs font-medium uppercase tracking-[0.14em]">
                  What you get in the product
                </span>
              </div>
              <h2 className="mt-3 text-xl font-semibold tracking-tight text-zinc-50 sm:text-2xl md:text-3xl">
                Dashboard, research feed, slot board, review desk, screenshots.
              </h2>
              <ul className="mt-6 grid gap-3 text-sm text-zinc-400 sm:grid-cols-2">
                <li className="flex items-start gap-2">
                  <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-teal-400/80" />
                  Writing styles, topics, quality threshold
                </li>
                <li className="flex items-start gap-2">
                  <GitBranch className="mt-0.5 h-4 w-4 shrink-0 text-teal-400/80" />
                  Deduped sources + generation job logs
                </li>
                <li className="flex items-start gap-2">
                  <Radar className="mt-0.5 h-4 w-4 shrink-0 text-teal-400/80" />
                  Optional X bearer for research only
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-400/80" />
                  Copy pack for manual X / LinkedIn posts
                </li>
              </ul>
            </div>
            <div className="flex w-full flex-col gap-3 sm:flex-row lg:w-auto lg:flex-col">
              <Link
                href="/register"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-100 px-6 py-3.5 text-sm font-semibold text-zinc-950 transition hover:bg-white lg:w-auto"
              >
                Start building in public
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 px-6 py-3.5 text-sm font-medium text-zinc-200 transition hover:bg-white/[0.04] lg:w-auto"
              >
                I already have an account
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6 sm:py-10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-zinc-200">DevPulse AI</div>
            <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-600">
              A research-first content system for software engineers. Personal product · portfolio
              engineering · not a black-box growth tool.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-500">
            <Link href="/login" className="hover:text-zinc-300">
              Sign in
            </Link>
            <Link href="/register" className="hover:text-zinc-300">
              Register
            </Link>
            <span className="text-zinc-700">© {new Date().getFullYear()}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
