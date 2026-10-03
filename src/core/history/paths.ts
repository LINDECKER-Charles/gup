import { pathFlavour } from "../platform/path-flavour.js";
import { stateDir } from "../state/app-dirs.js";

/**
 * Where the history lives on disk: `stateDir("history")` (machine-local,
 * `GUP_HISTORY_DIR` first — see core/state/app-dirs.ts).
 *
 * One shard per calendar month (`2026-08.jsonl`): a single ever-growing file
 * would eventually need rotation logic, and a per-day file would scatter a
 * year of activity across 365 entries. Months keep each file small enough to
 * parse in one read while staying trivially selectable by name.
 *
 * The month comes from the UTC date so a shard boundary matches the `ts` field
 * of the records inside it, whatever the local offset.
 */

export interface HistoryLocation {
  /** Directory holding the shards. Created on demand by the store. */
  dir: string;
  /** Absolute path of the shard covering the requested date. */
  file: string;
}

/**
 * Resolve the shard covering `date`, or null when the platform exposes no
 * usable anchor (no `LOCALAPPDATA`, no home directory). A missing anchor turns
 * the history off rather than inventing a path.
 */
export function historyLocation(date: Date): HistoryLocation | null {
  const dir = stateDir("history");
  if (!dir) return null;
  return { dir, file: pathFlavour().join(dir, `${shardName(date)}.jsonl`) };
}

/** `YYYY-MM`, UTC. */
function shardName(date: Date): string {
  return date.toISOString().slice(0, 7);
}
