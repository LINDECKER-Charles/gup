import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where the history lives on disk.
 *
 * One shard per calendar month (`2026-08.jsonl`): a single ever-growing file
 * would eventually need rotation logic, and a per-day file would scatter a
 * year of activity across 365 entries. Months keep each file small enough to
 * parse in one read while staying trivially selectable by name.
 *
 * The month comes from the UTC date so a shard boundary matches the `ts` field
 * of the records inside it, whatever the local offset.
 */

/** Points the history somewhere else. Used by the tests and by custom setups. */
const DIR_OVERRIDE_ENV = "GUP_HISTORY_DIR";

/** Directory name under the platform data root, shared with the other gup state. */
const APP_DIR = "gup";

export interface HistoryLocation {
  /** Directory holding the shards. Created on demand by the store. */
  dir: string;
  /** Absolute path of the shard covering the requested date. */
  file: string;
}

/**
 * Resolve the shard covering `date`, or null when the platform exposes no
 * usable anchor (no `LOCALAPPDATA`, no home directory). A missing anchor turns
 * the history off rather than inventing a path: writing history into the
 * working directory would litter whatever repo the user happens to be in.
 */
export function historyLocation(date: Date): HistoryLocation | null {
  const dir = historyDir();
  if (!dir) return null;
  return { dir, file: join(dir, `${shardName(date)}.jsonl`) };
}

function historyDir(): string | null {
  const override = process.env[DIR_OVERRIDE_ENV];
  if (override) return override;
  const root = dataRoot();
  return root ? join(root, APP_DIR, "history") : null;
}

/**
 * Per-platform root for machine-local, user-owned state:
 *   - Windows: `%LOCALAPPDATA%` — where the Nerd Fonts lockfile already sits.
 *   - macOS: `~/Library/Application Support`.
 *   - elsewhere: `$XDG_STATE_HOME`, falling back to `~/.local/state`. The XDG
 *     spec files an activity log under *state*, not *data*: it is history, not
 *     something the user would want backed up or synced.
 */
function dataRoot(): string | null {
  if (process.platform === "win32") return process.env["LOCALAPPDATA"] || null;

  const home = homedir() || process.env["HOME"] || "";
  if (process.platform === "darwin") {
    return home ? join(home, "Library", "Application Support") : null;
  }
  const xdg = process.env["XDG_STATE_HOME"];
  if (xdg) return xdg;
  return home ? join(home, ".local", "state") : null;
}

/** `YYYY-MM`, UTC. */
function shardName(date: Date): string {
  return date.toISOString().slice(0, 7);
}
