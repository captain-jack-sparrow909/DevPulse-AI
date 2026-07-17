import type { DeploymentConfigCheck } from "@/lib/operations/config";

export type ReadinessStatus = "ready" | "degraded" | "unready";

export function summarizeReadiness(
  checks: DeploymentConfigCheck[],
  databaseReady: boolean,
): { status: ReadinessStatus; httpStatus: 200 | 503 } {
  if (!databaseReady || checks.some((check) => check.status === "missing")) {
    return { status: "unready", httpStatus: 503 };
  }
  if (checks.some((check) => check.status === "warning")) {
    return { status: "degraded", httpStatus: 200 };
  }
  return { status: "ready", httpStatus: 200 };
}
