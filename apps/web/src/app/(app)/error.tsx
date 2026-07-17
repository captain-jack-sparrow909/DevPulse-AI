"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("DevPulse page error", error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[65vh] max-w-xl items-center px-6 py-16">
      <div className="w-full rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-8 text-center">
        <AlertTriangle className="mx-auto h-9 w-9 text-amber-300" aria-hidden="true" />
        <h1 className="mt-5 text-xl font-semibold text-zinc-100">This page could not load</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Your data is unchanged. Retry the request; if it continues, check Operations for service health.
        </p>
        {error.digest ? <p className="mt-3 font-mono text-xs text-zinc-600">Reference {error.digest}</p> : null}
        <Button className="mt-6" onClick={reset}>
          <RotateCcw className="mr-2 h-4 w-4" /> Retry
        </Button>
      </div>
    </main>
  );
}
