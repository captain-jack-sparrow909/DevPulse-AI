"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";

const links = [
  { href: "#problem", label: "Problem" },
  { href: "#pipeline", label: "Pipeline" },
  { href: "#system", label: "System" },
  { href: "#proof", label: "Craft" },
] as const;

export function LandingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="relative z-30 mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-teal-500/30 bg-teal-500/10 font-mono text-xs font-semibold tracking-tight text-teal-300">
            DP
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-tight">DevPulse AI</div>
            <div className="hidden text-[11px] text-zinc-500 sm:block">
              Research-first content studio
            </div>
          </div>
        </div>

        <nav className="hidden items-center gap-8 text-sm text-zinc-400 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition hover:text-zinc-100">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:text-zinc-100 sm:inline"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-2 text-sm font-medium text-zinc-950 transition hover:bg-white sm:px-3.5"
          >
            <span className="sm:hidden">Start</span>
            <span className="hidden sm:inline">Open app</span>
            <ArrowRight className="hidden h-3.5 w-3.5 sm:block" />
          </Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-zinc-200 md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 rounded-xl border border-white/10 bg-zinc-950/95 p-3 shadow-xl backdrop-blur md:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-50"
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-50 sm:hidden"
            >
              Sign in
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
