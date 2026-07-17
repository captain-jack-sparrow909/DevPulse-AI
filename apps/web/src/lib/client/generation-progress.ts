export interface GenerationProgress {
  operationRunId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  phase: string;
  message: string | null;
  error: string | null;
  jobId: string | null;
  postsCreated: number;
  logs: string[];
}

export async function waitForGeneration(
  operationRunId: string,
  onProgress: (progress: GenerationProgress) => void,
  options: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<GenerationProgress> {
  const intervalMs = options.intervalMs ?? 1_500;
  const timeoutMs = options.timeoutMs ?? 3 * 60 * 1_000;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const response = await fetch(`/api/generate?operationRunId=${encodeURIComponent(operationRunId)}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as GenerationProgress & { error?: string };
    if (!response.ok) throw new Error(data.error || "Could not read generation progress");
    onProgress(data);
    if (["completed", "failed", "cancelled"].includes(data.status)) return data;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Generation is still running. You may leave this page; progress is saved in Operations.");
}
