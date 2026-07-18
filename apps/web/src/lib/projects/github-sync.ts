import type { OwnedRepository } from "@prisma/client";
import { prisma } from "@/lib/db";
import { researchFetch } from "@/lib/integrations/fetch";
import {
  assessRepositoryChange,
  buildProjectFact,
  type RepositoryChangeCandidate,
} from "@/lib/projects/significance";
import {
  extractDocumentationFacts,
  isProductDocumentationPath,
} from "@/lib/projects/documentation";
import { REPOSITORY_SYNC_INTERVAL_MS } from "@/lib/projects/freshness";

interface GitHubRepo {
  default_branch?: string;
  html_url?: string;
}

interface GitHubTree {
  truncated?: boolean;
  tree?: Array<{
    path?: string;
    type?: "blob" | "tree" | "commit";
    sha?: string;
    size?: number;
  }>;
}

interface GitHubContent {
  type?: string;
  encoding?: string;
  content?: string;
  size?: number;
  sha?: string;
}

interface GitHubCommitListItem {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author?: { name?: string; date?: string };
    committer?: { date?: string };
  };
  author?: { login?: string };
}

interface GitHubCommitDetail extends GitHubCommitListItem {
  stats?: { additions?: number; deletions?: number };
  files?: Array<{ filename?: string }>;
}

interface GitHubPull {
  number: number;
  title: string;
  body?: string | null;
  html_url: string;
  merged_at?: string | null;
  updated_at: string;
  user?: { login?: string };
  additions?: number;
  deletions?: number;
  changed_files?: number;
}

interface GitHubRelease {
  id: number;
  tag_name: string;
  name?: string | null;
  body?: string | null;
  html_url: string;
  published_at?: string | null;
  created_at: string;
  author?: { login?: string };
  draft?: boolean;
  prerelease?: boolean;
}

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "DevPulse-AI",
    "X-GitHub-Api-Version": "2026-03-10",
  };
  const token = process.env.GITHUB_TOKEN?.trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

async function githubJson<T>(path: string): Promise<T> {
  const response = await researchFetch(`https://api.github.com${path}`, {
    headers: githubHeaders(),
    timeoutMs: 15_000,
  });
  if (!response.ok) {
    const remaining = response.headers.get("x-ratelimit-remaining");
    const hint = remaining === "0" ? " GitHub rate limit reached; configure GITHUB_TOKEN." : "";
    throw new Error(`GitHub API ${response.status} for ${path}.${hint}`);
  }
  return (await response.json()) as T;
}

function sinceDate(repository: OwnedRepository) {
  const floor = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const prior = repository.lastSyncedAt?.getTime() ?? floor;
  return new Date(Math.max(floor, prior - 5 * 60 * 1000));
}

function firstLine(value?: string | null) {
  return value?.split("\n").map((line) => line.trim()).find(Boolean)?.slice(0, 500);
}

async function collectCommits(repository: OwnedRepository, since: Date) {
  const path = `/repos/${repository.owner}/${repository.repo}/commits?sha=${encodeURIComponent(repository.defaultBranch)}&per_page=30&since=${encodeURIComponent(since.toISOString())}`;
  const items = await githubJson<GitHubCommitListItem[]>(path);
  const detailCandidates = items
    .filter((item) => !/^(merge |bump |chore(?:\(.+\))?:|deps?(?:\(.+\))?:)/i.test(item.commit.message.trim()))
    .slice(0, 8);
  const details = await Promise.all(
    detailCandidates.map((item) =>
      githubJson<GitHubCommitDetail>(`/repos/${repository.owner}/${repository.repo}/commits/${item.sha}`),
    ),
  );
  const bySha = new Map(details.map((item) => [item.sha, item]));
  return {
    lastCommitSha: items[0]?.sha,
    changes: items.map((item): RepositoryChangeCandidate => {
      const detail = bySha.get(item.sha);
      return {
        externalId: item.sha,
        kind: "commit",
        title: firstLine(item.commit.message) || item.sha.slice(0, 8),
        summary: item.commit.message.slice(0, 2_000),
        url: item.html_url,
        author: item.author?.login || item.commit.author?.name,
        occurredAt: new Date(item.commit.author?.date || item.commit.committer?.date || Date.now()),
        changedFiles: detail?.files?.flatMap((file) => (file.filename ? [file.filename] : [])) ?? [],
        additions: detail?.stats?.additions,
        deletions: detail?.stats?.deletions,
        raw: item,
      };
    }),
  };
}

function documentationRank(path: string) {
  if (/^readme(?:\.[^/]+)?$/i.test(path)) return 100;
  if (/^(?:docs?|documentation)\//i.test(path)) return 80;
  if (/(?:product|feature|capabilit|roadmap|status|idea|architecture)/i.test(path)) return 60;
  return 20;
}

async function collectDocumentation(
  repository: OwnedRepository,
  headSha: string,
  occurredAt: Date,
): Promise<RepositoryChangeCandidate[]> {
  const tree = await githubJson<GitHubTree>(
    `/repos/${repository.owner}/${repository.repo}/git/trees/${encodeURIComponent(headSha)}?recursive=1`,
  );
  if (tree.truncated) {
    console.warn(`[project-sync] ${repository.fullName} tree was truncated; scanning returned entries only`);
  }
  const documents = (tree.tree ?? [])
    .filter((entry) =>
      entry.type === "blob" &&
      typeof entry.path === "string" &&
      typeof entry.sha === "string" &&
      (entry.size ?? 0) <= 200_000 &&
      isProductDocumentationPath(entry.path),
    )
    .sort((a, b) => documentationRank(b.path!) - documentationRank(a.path!))
    .slice(0, 8);

  const results: RepositoryChangeCandidate[] = [];
  for (const document of documents) {
    const path = document.path!;
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const content = await githubJson<GitHubContent>(
      `/repos/${repository.owner}/${repository.repo}/contents/${encodedPath}?ref=${encodeURIComponent(headSha)}`,
    );
    if (content.type !== "file" || content.encoding !== "base64" || !content.content) continue;
    const decoded = Buffer.from(content.content.replace(/\s/g, ""), "base64").toString("utf8");
    const facts = extractDocumentationFacts({ path, content: decoded });
    for (const fact of facts) {
      const lineAnchor = fact.lineEnd > fact.lineStart
        ? `#L${fact.lineStart}-L${fact.lineEnd}`
        : `#L${fact.lineStart}`;
      const sourceUrl = `https://github.com/${repository.fullName}/blob/${headSha}/${path}${lineAnchor}`;
      results.push({
        externalId: `${path}:${document.sha}:${fact.key}`,
        kind: "documentation",
        title: `${path}: ${fact.title}`,
        summary: fact.excerpt,
        url: sourceUrl,
        occurredAt,
        changedFiles: [path],
        raw: {
          path,
          blobSha: document.sha,
          headSha,
          lineStart: fact.lineStart,
          lineEnd: fact.lineEnd,
        },
        documentedFact: {
          title: fact.title,
          claim: fact.claim,
          confidence: 0.92,
          evidence: {
            path,
            blobSha: document.sha,
            headSha,
            lineStart: fact.lineStart,
            lineEnd: fact.lineEnd,
            excerpt: fact.excerpt,
          },
        },
      });
      if (results.length >= 24) return results;
    }
  }
  return results;
}

async function collectPulls(repository: OwnedRepository, since: Date) {
  const items = await githubJson<GitHubPull[]>(
    `/repos/${repository.owner}/${repository.repo}/pulls?state=closed&sort=updated&direction=desc&per_page=12`,
  );
  return items
    .filter((item) => item.merged_at && new Date(item.updated_at) >= since)
    .map((item): RepositoryChangeCandidate => ({
      externalId: String(item.number),
      kind: "pull_request",
      title: item.title,
      summary: firstLine(item.body),
      url: item.html_url,
      author: item.user?.login,
      occurredAt: new Date(item.merged_at || item.updated_at),
      changedFiles: [],
      additions: item.additions,
      deletions: item.deletions,
      raw: item,
    }));
}

async function collectReleases(repository: OwnedRepository, since: Date) {
  const items = await githubJson<GitHubRelease[]>(
    `/repos/${repository.owner}/${repository.repo}/releases?per_page=10`,
  );
  return items
    .filter((item) => !item.draft && new Date(item.published_at || item.created_at) >= since)
    .map((item): RepositoryChangeCandidate => ({
      externalId: String(item.id),
      kind: "release",
      title: item.name?.trim() || item.tag_name,
      summary: firstLine(item.body),
      url: item.html_url,
      author: item.author?.login,
      occurredAt: new Date(item.published_at || item.created_at),
      changedFiles: [],
      raw: item,
    }));
}

async function persistChange(repository: OwnedRepository, change: RepositoryChangeCandidate) {
  const assessment = assessRepositoryChange(change);
  const record = await prisma.repositoryChange.upsert({
    where: {
      repositoryId_kind_externalId: {
        repositoryId: repository.id,
        kind: change.kind,
        externalId: change.externalId,
      },
    },
    create: {
      repositoryId: repository.id,
      externalId: change.externalId,
      kind: change.kind,
      title: change.title.slice(0, 500),
      summary: change.summary?.slice(0, 4_000),
      url: change.url,
      author: change.author,
      occurredAt: change.occurredAt,
      changedFilesJson: JSON.stringify(change.changedFiles),
      additions: change.additions,
      deletions: change.deletions,
      rawJson: change.raw ? JSON.stringify(change.raw) : undefined,
      significanceScore: assessment.score,
      status: assessment.meaningful ? "candidate" : "noise",
      noiseReason: assessment.reason,
    },
    update: {
      title: change.title.slice(0, 500),
      summary: change.summary?.slice(0, 4_000),
      url: change.url,
      author: change.author,
      occurredAt: change.occurredAt,
      changedFilesJson: JSON.stringify(change.changedFiles),
      additions: change.additions,
      deletions: change.deletions,
      significanceScore: assessment.score,
      noiseReason: assessment.reason,
    },
  });

  if (!assessment.meaningful) return { meaningful: false, createdFact: false };
  const factData = buildProjectFact(change);
  const existing = await prisma.projectFact.findUnique({ where: { changeId: record.id } });
  if (!existing) {
    await prisma.projectFact.create({
      data: {
        userId: repository.userId,
        repositoryId: repository.id,
        changeId: record.id,
        projectId: repository.projectId,
        title: factData.title.slice(0, 500),
        claim: factData.claim.slice(0, 4_000),
        evidenceJson: JSON.stringify(factData.evidence),
        sourceUrl: change.url,
        confidence: factData.confidence,
      },
    });
    await prisma.repositoryChange.update({ where: { id: record.id }, data: { status: "fact_created" } });
  }
  return { meaningful: true, createdFact: !existing };
}

export interface RepositorySyncResult {
  repositoryId: string;
  fullName: string;
  changesFound: number;
  meaningfulChanges: number;
  factsCreated: number;
  ignoredChanges: number;
  documentationFacts: number;
  unchanged: boolean;
  error?: string;
}

export async function syncOwnedRepository(repository: OwnedRepository): Promise<RepositorySyncResult> {
  await prisma.ownedRepository.update({
    where: { id: repository.id },
    data: { syncStatus: "running", lastError: null },
  });
  try {
    const since = sinceDate(repository);
    const metadata = await githubJson<GitHubRepo>(`/repos/${repository.owner}/${repository.repo}`);
    const defaultBranch = metadata.default_branch || repository.defaultBranch;
    const head = await githubJson<GitHubCommitDetail>(
      `/repos/${repository.owner}/${repository.repo}/commits/${encodeURIComponent(defaultBranch)}`,
    );
    const repositoryAtHead = { ...repository, defaultBranch };
    const existingDocumentation = await prisma.repositoryChange.count({
      where: { repositoryId: repository.id, kind: "documentation" },
    });
    const changed = repository.lastCommitSha !== head.sha;
    const shouldScanDocumentation = changed || existingDocumentation === 0;
    const [commitResult, pulls, releases, documentation] = await Promise.all([
      changed
        ? collectCommits(repositoryAtHead, since)
        : Promise.resolve({ lastCommitSha: head.sha, changes: [] }),
      changed ? collectPulls(repositoryAtHead, since) : Promise.resolve([]),
      changed ? collectReleases(repositoryAtHead, since) : Promise.resolve([]),
      shouldScanDocumentation
        ? collectDocumentation(
            repositoryAtHead,
            head.sha,
            new Date(head.commit.author?.date || head.commit.committer?.date || Date.now()),
          )
        : Promise.resolve([]),
    ]);
    const changes = [...documentation, ...releases, ...pulls, ...commitResult.changes].slice(0, 40);
    let meaningfulChanges = 0;
    let factsCreated = 0;
    let documentationFacts = 0;
    for (const change of changes) {
      const persisted = await persistChange(repository, change);
      if (persisted.meaningful) meaningfulChanges += 1;
      if (persisted.createdFact) {
        factsCreated += 1;
        if (change.kind === "documentation") documentationFacts += 1;
      }
    }
    await prisma.ownedRepository.update({
      where: { id: repository.id },
      data: {
        syncStatus: "completed",
        lastSyncedAt: new Date(),
        lastCommitSha: head.sha || commitResult.lastCommitSha || repository.lastCommitSha,
        defaultBranch,
        url: metadata.html_url || repository.url,
        lastError: null,
      },
    });
    return {
      repositoryId: repository.id,
      fullName: repository.fullName,
      changesFound: changes.length,
      meaningfulChanges,
      factsCreated,
      ignoredChanges: changes.length - meaningfulChanges,
      documentationFacts,
      unchanged: !changed && existingDocumentation > 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Repository sync failed";
    await prisma.ownedRepository.update({
      where: { id: repository.id },
      data: { syncStatus: "failed", lastError: message.slice(0, 1_000) },
    });
    return {
      repositoryId: repository.id,
      fullName: repository.fullName,
      changesFound: 0,
      meaningfulChanges: 0,
      factsCreated: 0,
      ignoredChanges: 0,
      documentationFacts: 0,
      unchanged: false,
      error: message,
    };
  }
}

export async function syncStaleOwnedRepositories(
  maxAgeMs = REPOSITORY_SYNC_INTERVAL_MS,
): Promise<RepositorySyncResult[]> {
  const staleBefore = new Date(Date.now() - maxAgeMs);
  const repositories = await prisma.ownedRepository.findMany({
    where: {
      active: true,
      OR: [
        { lastSyncedAt: null },
        { lastSyncedAt: { lt: staleBefore } },
      ],
      NOT: {
        AND: [
          { syncStatus: "running" },
          { updatedAt: { gte: new Date(Date.now() - 30 * 60 * 1_000) } },
        ],
      },
    },
    orderBy: [{ lastSyncedAt: "asc" }, { createdAt: "asc" }],
  });
  const results: RepositorySyncResult[] = [];
  for (const repository of repositories) results.push(await syncOwnedRepository(repository));
  return results;
}

/**
 * Bounded fallback for the existing 15-minute external cron: process at most
 * one stale repository on an otherwise idle generation tick.
 */
export async function syncNextStaleOwnedRepository(
  maxAgeMs = REPOSITORY_SYNC_INTERVAL_MS,
): Promise<RepositorySyncResult | null> {
  const staleBefore = new Date(Date.now() - maxAgeMs);
  const repository = await prisma.ownedRepository.findFirst({
    where: {
      active: true,
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleBefore } }],
      NOT: {
        AND: [
          { syncStatus: "running" },
          { updatedAt: { gte: new Date(Date.now() - 30 * 60 * 1_000) } },
        ],
      },
    },
    orderBy: [{ lastSyncedAt: "asc" }, { createdAt: "asc" }],
  });
  return repository ? syncOwnedRepository(repository) : null;
}

export async function syncOwnedRepositories(userId: string, repositoryId?: string) {
  const repositories = await prisma.ownedRepository.findMany({
    where: { userId, active: true, ...(repositoryId ? { id: repositoryId } : {}) },
    orderBy: { createdAt: "asc" },
  });
  const results: RepositorySyncResult[] = [];
  for (const repository of repositories) results.push(await syncOwnedRepository(repository));
  return results;
}
