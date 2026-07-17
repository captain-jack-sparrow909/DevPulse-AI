"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Menu, X } from "lucide-react";
import { BrandMark } from "@/components/brand-mark";

const links = [
  { href: "#platform", label: "Platform" },
  { href: "#workflow", label: "Workflow" },
  { href: "#intelligence", label: "Intelligence" },
  { href: "#principles", label: "Principles" },
] as const;

export function LandingHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 border-b border-slate-300/[0.07] bg-[#05070c]/72 backdrop-blur-2xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          <BrandMark className="h-9 w-9 rounded-xl" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold tracking-[-0.02em] text-slate-50">DevPulse AI</div>
            <div className="hidden items-center gap-1.5 text-[10px] text-slate-500 sm:flex">
              <span className="h-1 w-1 rounded-full bg-emerald-400" />
              Signal-to-growth operating system
            </div>
          </div>
        </div>

        <nav className="hidden items-center gap-7 text-[13px] text-slate-400 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="transition hover:text-teal-100">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:text-slate-100 sm:inline"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="inline-flex items-center gap-1.5 rounded-xl border border-teal-200/20 bg-teal-300 px-3.5 py-2 text-sm font-semibold text-[#04110f] shadow-[0_8px_24px_-12px_rgba(69,230,208,0.8)] transition hover:-translate-y-0.5 hover:bg-teal-200"
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
        <div className="absolute inset-x-4 top-[4.4rem] rounded-2xl border border-slate-300/[0.1] bg-[#080c14]/98 p-3 shadow-2xl backdrop-blur-2xl md:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-teal-300/[0.06] hover:text-teal-100"
              >
                {l.label}
              </a>
            ))}
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="rounded-xl px-3 py-2.5 text-sm text-slate-300 hover:bg-teal-300/[0.06] hover:text-teal-100 sm:hidden"
            >
              Sign in
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
