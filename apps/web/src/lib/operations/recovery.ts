import { prisma } from "@/lib/db";
import { runPhasesWithBudget, type PhasedJobMeta } from "@/lib/ai/phased-pipeline";
import { syncOwnedRepositories } from "@/lib/projects/github-sync";
import { getBrandSettings, toBrandConfig } from "@/lib/visuals/brand";
import { validateVisualBrief } from "@/lib/visuals/brief";
import { renderVisualAsset } from "@/lib/visuals/render";
import { saveVisualFile } from "@/lib/visuals/storage";
import type { VisualAssetKind, VisualBrief } from "@/lib/visuals/types";
import {
  completeOperationalRun,
  failOperationalRun,
  recordOperationalEvent,
  startOperationalRun,
} from "@/lib/operations/store";

function parseMeta(value: string | null | undefined): PhasedJobMeta | null {
  try {
    const parsed = JSON.parse(value || "null") as PhasedJobMeta | null;
    return parsed?.kind === "phased_v1" ? parsed : null;
  } catch {
    return null;
  }
}

async function previousRun(userId: string, subjectType: string, subjectId: string) {
  return prisma.operationalRun.findFirst({
    where: { userId, subjectType, subjectId },
    orderBy: { startedAt: "desc" },
  });
}

export async function recoverGenerationJob(userId: string, jobId: string) {
  const job = await prisma.generationJob.findFirst({
    where: { id: jobId, userId },
    include: { researchRun: true },
  });
  if (!job) throw new Error("Generation job not found");
  if (job.status !== "failed") throw new Error("Only failed generation jobs can be resumed");
  if (!job.researchRunId || !job.researchRun) throw new Error("Generation checkpoint is missing its research run");
  const meta = parseMeta(job.researchRun.topicsRanked);
  if (!meta || meta.generationJobId !== job.id) throw new Error("This legacy job has no resumable phase checkpoint");
  const resumeStatus = meta.nextChunkIndex >= meta.totalChunks ? "write" : "research";
  await prisma.$transaction([
    prisma.generationJob.update({
      where: { id: job.id },
      data: { status: resumeStatus, error: null, completedAt: null },
    }),
    prisma.researchRun.update({
      where: { id: job.researchRunId },
      data: { status: "running", error: null, completedAt: null },
    }),
  ]);
  const previous = await previousRun(userId, "generation_job", job.id);
  return runPhasesWithBudget(userId, 50_000, { source: "recovery", retryOfId: previous?.id });
}

export async function recoverVisualAsset(userId: string, assetId: string) {
  const asset = await prisma.postVisualAsset.findFirst({
    where: { id: assetId, userId },
    include: { post: true },
  });
  if (!asset) throw new Error("Visual asset not found");
  if (asset.status !== "failed") throw new Error("Only failed visual assets can be retried");
  if (asset.kind !== "portrait_card" && asset.kind !== "linkedin_carousel") throw new Error("Unsupported visual asset kind");
  const brief = JSON.parse(asset.briefJson) as VisualBrief;
  const audit = validateVisualBrief(brief);
  if (audit.length) throw new Error(`Stored visual brief is invalid: ${audit.join("; ")}`);
  const previous = await previousRun(userId, "visual_asset", asset.id);
  const run = await startOperationalRun({
    userId,
    kind: "visual_render",
    source: "recovery",
    stage: "rendering",
    subjectType: "visual_asset",
    subjectId: asset.id,
    retryOfId: previous?.id,
    metadata: { kind: asset.kind, postId: asset.postId },
  });
  await prisma.postVisualAsset.update({ where: { id: asset.id }, data: { status: "rendering", error: null } });
  try {
    const brand = await getBrandSettings(userId, "Builder");
    const renderStarted = Date.now();
    const rendered = await renderVisualAsset(asset.kind as VisualAssetKind, brief, toBrandConfig(brand));
    await recordOperationalEvent(run.id, {
      stage: "rendered",
      message: `${asset.kind.replaceAll("_", " ")} rendered successfully.`,
      durationMs: Date.now() - renderStarted,
      metadata: { bytes: rendered.file.length, pages: rendered.pageCount },
    });
    const baseKey = `visuals/${userId}/${asset.postId}/${asset.id}`;
    const extension = rendered.mimeType === "application/pdf" ? "pdf" : "png";
    const storageStarted = Date.now();
    const file = await saveVisualFile(`${baseKey}.${extension}`, rendered.file, rendered.mimeType);
    const preview = rendered.mimeType === "image/png"
      ? file
      : await saveVisualFile(`${baseKey}-preview.png`, rendered.preview, "image/png");
    await recordOperationalEvent(run.id, {
      stage: "stored",
      message: "Rendered files saved to durable storage.",
      durationMs: Date.now() - storageStarted,
    });
    const target = asset.targetPlatform;
    const mediaTypeX = target === "x" || target === "both" ? "branded_visual" : asset.post.mediaTypeX;
    const mediaTypeLinkedIn = target === "linkedin" || target === "both"
      ? asset.kind === "linkedin_carousel" ? "carousel" : "branded_visual"
      : asset.post.mediaTypeLinkedIn;
    await prisma.$transaction([
      prisma.postVisualAsset.update({
        where: { id: asset.id },
        data: {
          status: "completed",
          filePath: file.publicPath,
          storageKey: file.storageKey,
          previewPath: preview.publicPath,
          previewStorageKey: preview.storageKey,
          mimeType: rendered.mimeType,
          width: rendered.width,
          height: rendered.height,
          pageCount: rendered.pageCount,
          error: null,
        },
      }),
      prisma.post.update({
        where: { id: asset.postId },
        data: {
          mediaTypeX,
          mediaTypeLinkedIn,
          mediaType: mediaTypeX === mediaTypeLinkedIn ? mediaTypeX : "mixed",
        },
      }),
    ]);
    await completeOperationalRun(run.id, { stage: "completed", message: "Visual retry completed." });
    return { assetId: asset.id, status: "completed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visual retry failed";
    await prisma.postVisualAsset.update({ where: { id: asset.id }, data: { status: "failed", error: message.slice(0, 2_000) } });
    await failOperationalRun(run.id, error, "visual_render");
    throw error;
  }
}

export async function recoverRepositorySync(userId: string, repositoryId: string) {
  const repository = await prisma.ownedRepository.findFirst({ where: { id: repositoryId, userId, active: true } });
  if (!repository) throw new Error("Repository not found");
  const previous = await previousRun(userId, "repository", repository.id);
  const run = await startOperationalRun({
    userId,
    kind: "project_sync",
    source: "recovery",
    stage: "syncing",
    subjectType: "repository",
    subjectId: repository.id,
    retryOfId: previous?.id,
    metadata: { fullName: repository.fullName },
  });
  try {
    const started = Date.now();
    const results = await syncOwnedRepositories(userId, repository.id);
    const result = results[0];
    if (!result || result.error) throw new Error(result?.error || "Repository sync returned no result");
    await recordOperationalEvent(run.id, {
      stage: "synced",
      message: `${result.changesFound} change(s) checked; ${result.factsCreated} fact(s) created.`,
      durationMs: Date.now() - started,
      metadata: { changesFound: result.changesFound, factsCreated: result.factsCreated },
    });
    await completeOperationalRun(run.id, { stage: "completed", message: "Repository retry completed." });
    return result;
  } catch (error) {
    await failOperationalRun(run.id, error, "project_sync");
    throw error;
  }
}

export async function markStaleOperationalWork(userId: string) {
  const now = Date.now();
  const staleRuns = await prisma.operationalRun.findMany({
    where: { userId, status: "running", heartbeatAt: { lt: new Date(now - 20 * 60 * 1_000) } },
  });
  for (const run of staleRuns) {
    await failOperationalRun(run.id, new Error("Operation heartbeat stalled for more than 20 minutes"), run.stage);
  }
  const visuals = await prisma.postVisualAsset.updateMany({
    where: { userId, status: "rendering", updatedAt: { lt: new Date(now - 15 * 60 * 1_000) } },
    data: { status: "failed", error: "Visual render stalled for more than 15 minutes" },
  });
  const repositories = await prisma.ownedRepository.updateMany({
    where: { userId, syncStatus: "running", updatedAt: { lt: new Date(now - 20 * 60 * 1_000) } },
    data: { syncStatus: "failed", lastError: "Repository sync stalled for more than 20 minutes" },
  });
  return { operationalRuns: staleRuns.length, visualAssets: visuals.count, repositories: repositories.count };
}
