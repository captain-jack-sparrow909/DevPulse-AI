"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth-client";
import { APP_NAME } from "@/lib/constants";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/posts", label: "Posts", icon: FileText },
  { href: "/generate", label: "Generate", icon: Sparkles },
  { href: "/research", label: "Research", icon: Radar },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/settings", label: "Settings", icon: Settings },
];

function NavLinks({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <nav className={cn("flex flex-col gap-1", className)}>
      {nav.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "group relative flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all duration-150",
              active
                ? "bg-teal-500/10 text-teal-200 shadow-[inset_0_0_0_1px_rgba(45,212,191,0.18)]"
                : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100",
            )}
          >
            {active && (
              <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-teal-400" />
            )}
            <Icon
              className={cn(
                "h-4 w-4 shrink-0 transition-colors",
                active ? "text-teal-300" : "text-zinc-500 group-hover:text-zinc-300",
              )}
            />
            <span className="font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="space-y-1 border-t border-white/[0.06] p-3">
      <Link
        href="/posts"
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
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-400/20 to-teal-600/5 font-mono text-xs font-bold text-teal-300 shadow-[inset_0_0_0_1px_rgba(45,212,191,0.25),0_0_20px_-6px_rgba(45,212,191,0.5)]">
        DP
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold tracking-tight text-zinc-50">{APP_NAME}</div>
        <div className="truncate text-[11px] text-zinc-500">Research-first studio</div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

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
      {/* Desktop sidebar */}
      <aside className="hidden w-[15.5rem] shrink-0 flex-col border-r border-white/[0.06] bg-[#0a0b10]/85 backdrop-blur-xl md:flex">
        <div className="border-b border-white/[0.06] px-5 py-5">
          <Brand />
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto p-3 app-scroll">
          <div className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-600">
            Workspace
          </div>
          <NavLinks />
        </div>
        <SidebarFooter />
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-white/[0.06] bg-[#0a0b10]/90 px-4 py-3 backdrop-blur-xl md:hidden">
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
            "absolute left-0 top-0 flex h-full w-[min(18.5rem,88vw)] flex-col border-r border-white/[0.08] bg-[#0a0b10] shadow-2xl transition-transform duration-200 ease-out",
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
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-9">{children}</div>
      </main>
    </div>
  );
}
