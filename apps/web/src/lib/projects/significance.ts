export type RepositoryChangeKind = "commit" | "pull_request" | "release";

export interface RepositoryChangeCandidate {
  externalId: string;
  kind: RepositoryChangeKind;
  title: string;
  summary?: string;
  url: string;
  author?: string;
  occurredAt: Date;
  changedFiles: string[];
  additions?: number;
  deletions?: number;
  raw?: unknown;
}

export interface SignificanceAssessment {
  score: number;
  meaningful: boolean;
  reason?: string;
}

const MEANINGFUL_TERMS = [
  "add",
  "architecture",
  "auth",
  "benchmark",
  "cache",
  "database",
  "deploy",
  "experiment",
  "feature",
  "fix",
  "implement",
  "latency",
  "migrate",
  "model",
  "performance",
  "pipeline",
  "release",
  "security",
  "ship",
  "support",
];

const ROUTINE_TITLE_PATTERNS = [
  /^merge (branch|pull request)/i,
  /^bump\b/i,
  /^chore(?:\(.+\))?:/i,
  /^deps?(?:\(.+\))?:/i,
  /^format(?:ting)?\b/i,
  /^lint\b/i,
  /^style(?:\(.+\))?:/i,
  /^update (?:package-lock|pnpm-lock|yarn\.lock)/i,
];

const ROUTINE_FILES = [
  /(^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i,
  /(^|\/)(?:dist|build|coverage|\.next)\//i,
  /\.snap$/i,
  /(?:^|\/)generated\//i,
];

const SOURCE_FILE = /\.(?:ts|tsx|js|jsx|py|go|rs|java|kt|swift|sql|prisma|graphql|ya?ml|toml)$/i;

export function assessRepositoryChange(
  change: RepositoryChangeCandidate,
): SignificanceAssessment {
  if (change.kind === "release") return { score: 95, meaningful: true };

  const text = `${change.title} ${change.summary ?? ""}`.toLowerCase();
  const files = change.changedFiles;
  const routineTitle = ROUTINE_TITLE_PATTERNS.some((pattern) => pattern.test(change.title.trim()));
  const routineFilesOnly =
    files.length > 0 && files.every((file) => ROUTINE_FILES.some((pattern) => pattern.test(file)));
  const readmeOnly = files.length > 0 && files.every((file) => /(^|\/)readme(?:\.[^/]+)?$/i.test(file));

  let score = change.kind === "pull_request" ? 58 : 22;
  if (MEANINGFUL_TERMS.some((term) => text.includes(term))) score += 28;
  if (files.some((file) => SOURCE_FILE.test(file) && !ROUTINE_FILES.some((p) => p.test(file)))) {
    score += 18;
  }
  if ((change.additions ?? 0) + (change.deletions ?? 0) >= 80) score += 10;
  if (routineTitle) score -= 45;
  if (routineFilesOnly) score -= 55;
  if (readmeOnly) score -= 30;
  score = Math.max(0, Math.min(100, score));

  if (routineFilesOnly) return { score, meaningful: false, reason: "Generated or dependency files only" };
  if (routineTitle && score < 45) return { score, meaningful: false, reason: "Routine maintenance change" };
  if (readmeOnly && score < 45) return { score, meaningful: false, reason: "Documentation-only change" };
  if (score < 45) return { score, meaningful: false, reason: "Below the meaningful-change threshold" };
  return { score, meaningful: true };
}

export function buildProjectFact(change: RepositoryChangeCandidate) {
  const changedFiles = change.changedFiles.slice(0, 8);
  const fileEvidence = changedFiles.length
    ? ` Changed files include ${changedFiles.join(", ")}.`
    : "";
  const stats =
    change.additions != null || change.deletions != null
      ? ` The recorded diff contains ${change.additions ?? 0} additions and ${change.deletions ?? 0} deletions.`
      : "";
  const claim = `${change.title.trim().replace(/[.!?]+$/, "")}.${fileEvidence}${stats}`.trim();

  return {
    title: change.kind === "release" ? `Released: ${change.title}` : `Repository change: ${change.title}`,
    claim,
    confidence: change.kind === "release" ? 0.95 : change.kind === "pull_request" ? 0.9 : 0.78,
    evidence: {
      kind: change.kind,
      externalId: change.externalId,
      title: change.title,
      summary: change.summary ?? null,
      url: change.url,
      author: change.author ?? null,
      occurredAt: change.occurredAt.toISOString(),
      changedFiles,
      additions: change.additions ?? null,
      deletions: change.deletions ?? null,
    },
  };
}
