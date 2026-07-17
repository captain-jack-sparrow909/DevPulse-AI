"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { performanceCsvTemplate } from "@/lib/analytics/performance-csv";

export function BulkPerformanceImport({
  posts,
}: {
  posts: Array<{ id: string; title: string }>;
}) {
  const router = useRouter();
  const template = useMemo(() => performanceCsvTemplate(posts), [posts]);
  const [csv, setCsv] = useState(template);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [format, setFormat] = useState<"devpulse" | "x" | "linkedin">("devpulse");
  const [fileName, setFileName] = useState<string | null>(null);

  function download() {
    const blob = new Blob([template], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "devpulse-performance-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function importCsv() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/performance/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv, format, fileName }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Import failed");
      setMessage(`${data.message || `Imported ${data.imported} performance snapshot${data.imported === 1 ? "" : "s"}.`} ${data.duplicates ? `${data.duplicates} duplicate row(s) skipped.` : ""}`.trim());
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadFile(file: File | null) {
    if (!file) return;
    setCsv(await file.text());
    setFileName(file.name);
    setMessage(`Loaded ${file.name}. Review the rows before importing.`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <select value={format} onChange={(event) => setFormat(event.target.value as typeof format)} className="h-8 rounded-lg border border-white/10 bg-[#0d0f14] px-3 text-xs text-zinc-300 outline-none focus:border-teal-400/40">
          <option value="devpulse">DevPulse template</option>
          <option value="x">X metrics CSV</option>
          <option value="linkedin">LinkedIn metrics CSV</option>
        </select>
        <Button type="button" variant="outline" size="sm" onClick={download}>
          Download prefilled CSV
        </Button>
        <label className="inline-flex h-8 cursor-pointer items-center justify-center rounded-lg border border-white/10 px-3 text-xs font-medium text-zinc-300 hover:bg-white/[0.05]">
          Load completed CSV
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(event) => loadFile(event.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <Textarea
        value={csv}
        onChange={(event) => setCsv(event.target.value)}
        rows={8}
        className="font-mono text-xs"
        aria-label="Performance CSV"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Button type="button" size="sm" disabled={busy || !csv.trim()} onClick={importCsv}>
          {busy ? "Importing…" : "Import snapshots"}
        </Button>
        {message && <p className="text-xs text-zinc-400">{message}</p>}
      </div>
      <p className="text-xs leading-relaxed text-zinc-600">
        Rows are cumulative snapshots. X/LinkedIn mode accepts common aliases such as views, reactions, comments, retweets, shares, bookmarks, and clicks, but every row still needs a DevPulse postId so attribution is explicit. Exact files and repeated rows are skipped safely.
      </p>
    </div>
  );
}
