"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ValidationStudyControls({ studyId, canCapture }: { studyId?: string; canCapture?: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function run() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/validation-studies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(studyId ? { action: "capture", studyId } : { action: "start" }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Action failed");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button onClick={run} disabled={loading || (Boolean(studyId) && !canCapture)}>
        {studyId ? <RefreshCw className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
        {loading ? "Working…" : studyId ? canCapture ? "Capture due checkpoint" : "Next checkpoint not due" : "Start 30-day validation"}
      </Button>
      {message ? <p className="text-sm text-amber-300" role="alert">{message}</p> : null}
    </div>
  );
}
