import { TICK_INTERVAL_MINUTES } from "../scheduler-timing.js";
import { isUnsafePath, type TaskCommand } from "../trigger/task-command.js";
import { ARTIFACT_ERRORS } from "./artifact-errors.js";

/**
 * gup's managed block in the user's crontab. Every other line is kept byte
 * for byte; adding, replacing and removing the block are idempotent. A
 * crontab whose block lost one of its markers (a hand edit) is refused
 * rather than guessed at.
 *
 * cron hands the line to `/bin/sh`: each path is single-quoted, and a path
 * holding a quote, a `%` (cron turns it into a newline) or a control
 * character is refused.
 */

export const CRON_BLOCK_BEGIN = "# >>> gup-scheduler >>>";
export const CRON_BLOCK_END = "# <<< gup-scheduler <<<";
/**
 * English whatever the interface's language: only the markers find the
 * block, but a note that followed the language would rewrite the crontab at
 * each repair made in another one.
 */
const CRON_BLOCK_NOTE =
  "# Managed by gup (gup schedule uninstall to remove). Do not edit by hand.";

interface BlockSpan {
  readonly start: number;
  /** Just past the end marker's line break (or the end of the text). */
  readonly end: number;
}

/** The cron line that starts a tick every interval, output discarded. */
export function cronLine(command: TaskCommand): string {
  const argv = [command.node, command.entry].map((path) => {
    if (isUnsafePath(path, "linux")) throw new Error(ARTIFACT_ERRORS.unsafePath(path));
    return `'${path}'`;
  });
  const commandLine = [...argv, ...command.args].join(" ");
  return `*/${TICK_INTERVAL_MINUTES} * * * * ${commandLine} >/dev/null 2>&1`;
}

/** `crontab` with gup's block added or replaced. */
export function upsertGupBlock(crontab: string, command: TaskCommand): string {
  const eol = lineBreakOf(crontab);
  const lines = [CRON_BLOCK_BEGIN, CRON_BLOCK_NOTE, cronLine(command), CRON_BLOCK_END, ""];
  const block = lines.join(eol);
  const span = findBlock(crontab);
  if (span) return crontab.slice(0, span.start) + block + crontab.slice(span.end);
  if (crontab === "") return block;
  return crontab.endsWith("\n") ? crontab + block : crontab + eol + block;
}

/** `crontab` without gup's block (unchanged when there is none). */
export function removeGupBlock(crontab: string): string {
  const span = findBlock(crontab);
  return span ? crontab.slice(0, span.start) + crontab.slice(span.end) : crontab;
}

export function hasGupBlock(crontab: string): boolean {
  return findBlock(crontab) !== null;
}

function lineBreakOf(text: string): string {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

/** The block's span, null when absent; throws when only one marker is left. */
function findBlock(crontab: string): BlockSpan | null {
  const start = markerLineStart(crontab, CRON_BLOCK_BEGIN, 0);
  const endMarker = markerLineStart(crontab, CRON_BLOCK_END, start ?? 0);
  if (start === null && endMarker === null) return null;
  if (start === null || endMarker === null) throw new Error(ARTIFACT_ERRORS.brokenBlock);
  const lineEnd = crontab.indexOf("\n", endMarker);
  return { start, end: lineEnd === -1 ? crontab.length : lineEnd + 1 };
}

/** Index of the first line at or after `from` that begins with `marker`. */
function markerLineStart(text: string, marker: string, from: number): number | null {
  for (let at = text.indexOf(marker, from); at !== -1; at = text.indexOf(marker, at + 1)) {
    if (at === 0 || text[at - 1] === "\n") return at;
  }
  return null;
}
