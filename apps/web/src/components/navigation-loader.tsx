"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PulseLoader } from "@/components/pulse-loader";
import { cn } from "@/lib/utils";

/**
 * Shows a top progress bar + soft pulse overlay on client navigations
 * (sidebar links, post rows, back/forward). Clears when the URL settles.
 */
export function NavigationLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [visible, setVisible] = useState(false);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const routeKey = `${pathname}?${searchParams?.toString() ?? ""}`;
  const prevRoute = useRef(routeKey);

  const clearTimers = useCallback(() => {
    if (safetyRef.current) {
      clearTimeout(safetyRef.current);
      safetyRef.current = null;
    }
    if (hideRef.current) {
      clearTimeout(hideRef.current);
      hideRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    clearTimers();
    setPending(true);
    setVisible(true);
    // Fail-safe: never leave the loader stuck
    safetyRef.current = setTimeout(() => {
      setPending(false);
      setVisible(false);
    }, 10_000);
  }, [clearTimers]);

  const finish = useCallback(() => {
    clearTimers();
    setPending(false);
    // Keep bar briefly so the finish animation is visible
    hideRef.current = setTimeout(() => setVisible(false), 280);
  }, [clearTimers]);

  // Capture same-origin link navigations immediately on click
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const el = (e.target as Element | null)?.closest?.("a");
      if (!el) return;

      const anchor = el as HTMLAnchorElement;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
        return;
      }
      if (href.startsWith("javascript:")) return;

      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return;

      const curNorm = `${window.location.pathname}${window.location.search}`;
      const nextNorm = `${url.pathname}${url.search}`;
      if (nextNorm === curNorm) return;

      start();
    }

    // Also catch programmatic router.push via history (limited signal)
    function onPopState() {
      start();
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [start]);

  // Route settled
  useEffect(() => {
    if (prevRoute.current !== routeKey) {
      prevRoute.current = routeKey;
      finish();
    }
  }, [routeKey, finish]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  if (!visible && !pending) return null;

  return (
    <>
      {/* Top progress bar */}
      <div
        className={cn(
          "pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2px] overflow-hidden",
          !pending && "opacity-0 transition-opacity duration-300",
        )}
        aria-hidden
      >
        <div
          className={cn(
            "nav-progress-bar h-full w-full origin-left bg-gradient-to-r from-teal-500/0 via-teal-300 to-teal-400",
            pending ? "nav-progress-running" : "nav-progress-done",
          )}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent nav-progress-sheen" />
      </div>

      {/* Soft content overlay with pulse */}
      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-[90] flex items-center justify-center transition-opacity duration-200",
          pending ? "opacity-100" : "opacity-0",
        )}
        aria-hidden={!pending}
      >
        <div className="absolute inset-0 bg-[#07080b]/35 backdrop-blur-[1px] md:left-[15.5rem]" />
        <div
          className={cn(
            "relative mx-4 flex flex-col items-center gap-3 rounded-2xl border border-white/[0.08] bg-[#0c0e14]/92 px-8 py-7 shadow-[0_0_60px_-12px_rgba(45,212,191,0.35)] backdrop-blur-md transition-all duration-200",
            pending ? "scale-100 opacity-100" : "scale-95 opacity-0",
          )}
        >
          <PulseLoader label="Loading view…" size="md" />
          <p className="text-[10px] uppercase tracking-[0.16em] text-zinc-600">DevPulse</p>
        </div>
      </div>
    </>
  );
}
