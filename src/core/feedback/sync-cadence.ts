import type { UploadCursor } from "./upload-cursor.js";

/**
 * When the shared journals are synced next: about once a week. A sync is
 * due when none has completed yet, when the last completed one is at least
 * `intervalDays` old, or when one is unfinished — a run acknowledged a batch
 * after the last completed sync, then stopped (its budget, the service): the
 * next run resumes it at once instead of waiting a week. A completed sync
 * dated in the future (the clock was set back) does not hold the next one.
 */

const DAY_MS = 86_400_000;

/** The instant (epoch ms) the next sync is due from, or null when it is due now. */
export function nextSyncAt(
  cursor: UploadCursor,
  now: number,
  intervalDays: number,
): number | null {
  if (cursor.lastSyncAt === null) return null;
  const lastSync = Date.parse(cursor.lastSyncAt);
  const lastUpload = cursor.lastUploadAt === null ? null : Date.parse(cursor.lastUploadAt);
  if (lastUpload !== null && lastUpload > lastSync) return null;
  const dueAt = lastSync + intervalDays * DAY_MS;
  return lastSync <= now && dueAt > now ? dueAt : null;
}
