"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Sparkles,
  Calendar,
  Settings,
  Radar,
  LogOut,
  Search,
  Menu,
  X,
  BarChart3,
  MessageCircleMore,
  FlaskConical,
  GitBranch,
  Send,
  Megaphone,
  MousePointerClick,
  ServerCog,
  TrendingUp,
  CalendarCheck2,
  ListChecks,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth-client";
import { APP_NAME } from "@/lib/constants";
import { NavigationLoader } from "@/components/navigation-loader";
import { BrandMark } from "@/components/brand-mark";

const navSections = [
  {
    label: "Create",
    items: [
      { href: "/dashboard", label: "Command center", icon: LayoutDashboard },
      { href: "/publishing", label: "Publishing", icon: ListChecks },
      { href: "/posts", label: "Content library", icon: FileText },
      { href: "/generate", label: "Generate", icon: Sparkles },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/research", label: "Research radar", icon: Radar },
      { href: "/projects", label: "Project memory", icon: GitBranch },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/experiments", label: "Experiments", icon: FlaskConical },
    ],
  },
  {
    label: "Growth",
    items: [
      { href: "/engagement", label: "Engagement", icon: MessageCircleMore },
      { href: "/distribution", label: "Distribution", icon: Send },
      { href: "/campaigns", label: "Campaigns", icon: Megaphone },
      { href: "/attribution", label: "Attribution", icon: MousePointerClick },
      { href: "/growth-review", label: "Weekly review", icon: TrendingUp },
      { href: "/execution", label: "Execution plan", icon: CalendarCheck2 },
      { href: "/validation", label: "30-day validation", icon: Target },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/schedule", label: "Schedule", icon: Calendar },
      { href: "/operations", label: "Operations", icon: ServerCog },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
] as const;

function NavLinks({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-5", className)}>
      {navSections.map((section) => (
        <div key={section.label}>
          <div className="mb-1.5 px-3 font-mono text-[9px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            {section.label}
          </div>
          <div className="space-y-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + "/");
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={false}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-all duration-200",
                    active
                      ? "bg-[linear-gradient(100deg,rgba(69,230,208,0.13),rgba(69,230,208,0.035))] text-teal-100 shadow-[inset_0_0_0_1px_rgba(69,230,208,0.16),0_10px_30px_-22px_rgba(69,230,208,0.55)]"
                      : "text-slate-400 hover:bg-slate-200/[0.045] hover:text-slate-100",
                  )}
                >
                  {active && <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-teal-300 shadow-[0_0_12px_rgba(69,230,208,0.9)]" />}
                  <Icon className={cn("h-4 w-4 shrink-0 transition-colors", active ? "text-teal-300" : "text-slate-600 group-hover:text-slate-300")} />
                  <span className="font-medium">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="space-y-1 border-t border-white/[0.06] p-3">
      <Link
        href="/posts"
        prefetch={false}
        onClick={onNavigate}
        className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-100"
      >
        <Search className="h-4 w-4 shrink-0 text-zinc-500" />
        Search posts
      </Link>
      <button
        type="button"
        onClick={() =>
          signOut({
            fetchOptions: {
              onSuccess: () => {
                window.location.href = "/login";
              },
            },
          })
        }
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-zinc-400 transition hover:bg-white/[0.04] hover:text-zinc-100"
      >
        <LogOut className="h-4 w-4 shrink-0 text-zinc-500" />
        Sign out
      </button>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <BrandMark />
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold tracking-[-0.02em] text-slate-50">{APP_NAME}</div>
        <div className="flex items-center gap-1.5 truncate text-[10px] text-slate-500">
          <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_7px_rgba(52,211,153,0.8)]" />
          Signal engine online
        </div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="flex min-h-dvh min-h-screen flex-col md:flex-row">
      {/* Client navigations (posts, nav links, etc.) */}
      <Suspense fallback={null}>
        <NavigationLoader />
      </Suspense>

      {/* Desktop sidebar */}
      <aside className="hidden w-[16.5rem] shrink-0 flex-col border-r border-slate-300/[0.07] bg-[#070a11]/88 shadow-[18px_0_60px_-48px_rgba(69,230,208,0.35)] backdrop-blur-2xl md:flex">
        <div className="border-b border-slate-300/[0.07] px-5 py-5">
          <Brand />
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto px-3 py-5 app-scroll">
          <NavLinks />
        </div>
        <SidebarFooter />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-slate-300/[0.08] bg-[#070a11]/88 px-4 py-3 backdrop-blur-2xl md:hidden">
        <Brand />
        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-200"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* Mobile drawer */}
      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <button
          type="button"
          aria-label="Close menu"
          className={cn(
            "absolute inset-0 bg-black/65 backdrop-blur-[2px] transition-opacity",
            open ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setOpen(false)}
        />
        <aside
          className={cn(
            "absolute left-0 top-0 flex h-full w-[min(19rem,90vw)] flex-col border-r border-slate-300/[0.09] bg-[#070a11] shadow-2xl transition-transform duration-200 ease-out",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-4">
            <Brand />
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 app-scroll">
            <NavLinks onNavigate={() => setOpen(false)} />
          </div>
          <SidebarFooter onNavigate={() => setOpen(false)} />
        </aside>
      </div>

      {/* Main content */}
      <main className="app-main min-w-0 flex-1 overflow-x-hidden">
        <div className="mx-auto w-full max-w-[90rem] px-4 py-5 sm:px-6 sm:py-8 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
