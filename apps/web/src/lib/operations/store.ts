import { prisma } from "@/lib/db";

export type OperationSource = "cron" | "manual" | "recovery" | "system";

function safeMetadata(value: Record<string, unknown> | undefined): string {
  if (!value) return "{}";
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "string") return item.slice(0, 500);
    return item;
  }).slice(0, 8_000);
}

export function classifyOperationalError(error: unknown): {
  code: string;
  message: string;
  recoveryAction: string;
} {
  const message = (error instanceof Error ? error.message : String(error || "Unknown failure")).slice(0, 2_000);
  const value = message.toLowerCase();
  if (/timed? out|timeout|aborted/.test(value)) {
    return { code: "timeout", message, recoveryAction: "Retry once. If it repeats, inspect the slowest stage and provider latency." };
  }
  if (/429|rate.?limit|quota/.test(value)) {
    return { code: "rate_limit", message, recoveryAction: "Wait for the provider window to reset, then retry from the saved checkpoint." };
  }
  if (/401|403|unauthori[sz]ed|forbidden|credential|api key/.test(value)) {
    return { code: "credentials", message, recoveryAction: "Correct the deployment credential, redeploy, then retry the failed item." };
  }
  if (/p1001|postgres|database|prepared statement|prisma/.test(value)) {
    return { code: "database", message, recoveryAction: "Check Supabase availability and the pooled DATABASE_URL before retrying." };
  }
  if (/r2|s3|bucket|storage|upload/.test(value)) {
    return { code: "storage", message, recoveryAction: "Verify the R2 endpoint, bucket, and S3 credentials, then retry the asset." };
  }
  if (/fetch failed|enotfound|econn|network|dns/.test(value)) {
    return { code: "network", message, recoveryAction: "Check the external service and retry; the persisted checkpoint is unchanged." };
  }
  if (/not configured|missing|environment|env /.test(value)) {
    return { code: "configuration", message, recoveryAction: "Add the missing Vercel environment variable and redeploy." };
  }
  return { code: "unknown", message, recoveryAction: "Review the stage event, correct the cause, then retry from the dashboard." };
}

export async function startOperationalRun(input: {
  userId?: string | null;
  kind: string;
  source?: OperationSource;
  stage?: string;
  subjectType?: string;
  subjectId?: string;
  retryOfId?: string;
  metadata?: Record<string, unknown>;
}) {
  let attempt = 1;
  if (input.retryOfId) {
    const previous = await prisma.operationalRun.findUnique({
      where: { id: input.retryOfId },
      select: { attempt: true },
    });
    attempt = (previous?.attempt ?? 0) + 1;
  }
  const run = await prisma.operationalRun.create({
    data: {
      userId: input.userId ?? null,
      kind: input.kind,
      source: input.source ?? "system",
      stage: input.stage ?? "starting",
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      retryOfId: input.retryOfId,
      attempt,
      metadataJson: safeMetadata(input.metadata),
      events: {
        create: {
          stage: input.stage ?? "starting",
          message: `${input.kind.replaceAll("_", " ")} started`,
          metadataJson: safeMetadata(input.metadata),
        },
      },
    },
  });
  return run;
}

export async function recordOperationalEvent(
  runId: string,
  input: {
    stage: string;
    level?: "info" | "warning" | "error";
    message: string;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  },
) {
  const now = new Date();
  const [event] = await prisma.$transaction([
    prisma.operationalEvent.create({
      data: {
        runId,
        stage: input.stage,
        level: input.level ?? "info",
        message: input.message.slice(0, 2_000),
        durationMs: input.durationMs,
        metadataJson: safeMetadata(input.metadata),
      },
    }),
    prisma.operationalRun.update({
      where: { id: runId },
      data: { stage: input.stage, heartbeatAt: now },
    }),
  ]);
  return event;
}

export async function recordOperationalEvents(
  runId: string,
  inputs: Array<{
    stage: string;
    level?: "info" | "warning" | "error";
    message: string;
    durationMs?: number;
    metadata?: Record<string, unknown>;
  }>,
) {
  if (!inputs.length) return;
  const now = new Date();
  await prisma.$transaction([
    prisma.operationalEvent.createMany({
      data: inputs.map((input) => ({
        runId,
        stage: input.stage,
        level: input.level ?? "info",
        message: input.message.slice(0, 2_000),
        durationMs: input.durationMs,
        metadataJson: safeMetadata(input.metadata),
      })),
    }),
    prisma.operationalRun.update({
      where: { id: runId },
      data: { stage: inputs[inputs.length - 1]!.stage, heartbeatAt: now },
    }),
  ]);
}

export async function completeOperationalRun(
  runId: string,
  input: { stage?: string; message?: string; metadata?: Record<string, unknown> } = {},
) {
  const now = new Date();
  const current = await prisma.operationalRun.findUnique({ where: { id: runId } });
  if (!current) return null;
  const stage = input.stage ?? "completed";
  if (input.message) {
    await recordOperationalEvent(runId, {
      stage,
      message: input.message,
      metadata: input.metadata,
    });
  }
  return prisma.operationalRun.update({
    where: { id: runId },
    data: {
      status: "completed",
      stage,
      message: input.message,
      completedAt: now,
      heartbeatAt: now,
      durationMs: Math.max(0, now.getTime() - current.startedAt.getTime()),
    },
  });
}

export async function failOperationalRun(runId: string, error: unknown, stage?: string) {
  const now = new Date();
  const current = await prisma.operationalRun.findUnique({ where: { id: runId } });
  if (!current) return null;
  const failure = classifyOperationalError(error);
  await recordOperationalEvent(runId, {
    stage: stage ?? current.stage,
    level: "error",
    message: failure.message,
    metadata: { errorCode: failure.code },
  });
  return prisma.operationalRun.update({
    where: { id: runId },
    data: {
      status: "failed",
      stage: stage ?? current.stage,
      errorCode: failure.code,
      errorMessage: failure.message,
      recoveryAction: failure.recoveryAction,
      completedAt: now,
      heartbeatAt: now,
      durationMs: Math.max(0, now.getTime() - current.startedAt.getTime()),
    },
  });
}
