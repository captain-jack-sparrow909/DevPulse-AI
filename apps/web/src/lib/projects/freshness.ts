/** Start refreshing at 3.5h so three repositories fit inside the 3–4h target. */
export const REPOSITORY_SYNC_INTERVAL_MS = 3.5 * 60 * 60 * 1_000;
export const REPOSITORY_STALE_AFTER_MS = 4 * 60 * 60 * 1_000;

export function repositoryIsStale(
  lastSyncedAt: Date | string | null,
  now = new Date(),
): boolean {
  if (!lastSyncedAt) return true;
  return now.getTime() - new Date(lastSyncedAt).getTime() > REPOSITORY_STALE_AFTER_MS;
}
