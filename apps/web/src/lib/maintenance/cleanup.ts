import { readdir, stat, unlink } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/db";

const DAY_MS = 24 * 60 * 60 * 1000;
const POST_RETENTION_DAYS = 30;
const SCREENSHOT_RETENTION_DAYS = 1;

export interface CleanupResult {
  postsDeleted: number;
  sourcesDeleted: number;
  researchRunsDeleted: number;
  generationJobsDeleted: number;
  screenshotsDeleted: number;
  logs: string[];
}

/**
 * Free-tier hygiene:
 * - Keep Supabase lean: drop posts (and related rows via cascade) older than 30 days
 * - Drop stale research rows older than 30 days
 * - Delete local Playwright screenshots older than 1 day
 *
 * Also touches the DB so free-tier projects stay active when cron runs.
 */
export async function runRetentionCleanup(): Promise<CleanupResult> {
  const logs: string[] = [];
  const log = (m: string) => logs.push(`[${new Date().toISOString()}] ${m}`);

  const postCutoff = new Date(Date.now() - POST_RETENTION_DAYS * DAY_MS);
  const researchCutoff = postCutoff;

  log(`Retention: posts/sources older than ${POST_RETENTION_DAYS}d; screenshots older than ${SCREENSHOT_RETENTION_DAYS}d`);

  // Posts older than 30 days (cascades schedules, readiness jobs, post sources)
  const oldPosts = await prisma.post.deleteMany({
    where: { createdAt: { lt: postCutoff } },
  });
  log(`Deleted ${oldPosts.count} posts older than ${postCutoff.toISOString()}`);

  // Orphan-ish research data (sources not strictly FK-protected from posts after cascade)
  const oldSources = await prisma.source.deleteMany({
    where: { fetchedAt: { lt: researchCutoff } },
  });
  log(`Deleted ${oldSources.count} sources older than 30 days`);

  const oldRuns = await prisma.researchRun.deleteMany({
    where: { startedAt: { lt: researchCutoff } },
  });
  log(`Deleted ${oldRuns.count} research runs older than 30 days`);

  const oldJobs = await prisma.generationJob.deleteMany({
    where: { createdAt: { lt: researchCutoff } },
  });
  log(`Deleted ${oldJobs.count} generation jobs older than 30 days`);

  // Analytics noise
  try {
    await prisma.analyticsEvent.deleteMany({
      where: { recordedAt: { lt: postCutoff } },
    });
  } catch {
    // table may be empty / fine
  }

  const screenshotsDeleted = await cleanupOldScreenshots(SCREENSHOT_RETENTION_DAYS, log);

  // Lightweight keep-alive touch (helps free-tier "activity")
  await prisma.user.count();

  return {
    postsDeleted: oldPosts.count,
    sourcesDeleted: oldSources.count,
    researchRunsDeleted: oldRuns.count,
    generationJobsDeleted: oldJobs.count,
    screenshotsDeleted,
    logs,
  };
}

async function cleanupOldScreenshots(
  maxAgeDays: number,
  log: (m: string) => void,
): Promise<number> {
  const dir = path.join(process.cwd(), "public", "screenshots");
  const cutoff = Date.now() - maxAgeDays * DAY_MS;
  let deleted = 0;

  try {
    const files = await readdir(dir);
    for (const name of files) {
      if (name === ".gitkeep") continue;
      if (!/\.(png|jpe?g|webp|gif)$/i.test(name)) continue;
      const full = path.join(dir, name);
      try {
        const st = await stat(full);
        if (st.mtimeMs < cutoff) {
          await unlink(full);
          deleted++;
        }
      } catch {
        // skip file errors
      }
    }
    log(`Deleted ${deleted} screenshot file(s) older than ${maxAgeDays} day(s)`);
  } catch {
    log("Screenshot directory missing or unreadable — skipped");
  }

  return deleted;
}
