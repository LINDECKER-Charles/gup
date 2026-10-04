import chalk from "chalk";
import type { LogLevel } from "../../core/log/log.js";
import { readLogTail, type LogQuery, type LogTail } from "../../core/log/log-reader.js";
import { isLogLevel, type LogRecord } from "../../core/log/types.js";
import { stateDir } from "../../core/state/app-dirs.js";
import { parsePeriod } from "../../core/time/period.js";
import { logRecordText } from "../../ui/log-line.js";
import { ERROR_PREFIX } from "../../ui/text/cli-labels.js";
import { LOG_MESSAGES } from "../../ui/text/journal/log-labels.js";

/**
 * `gup log [show]`: the newest lines of the debug log, filtered, one line per
 * record (or the raw JSON with `--json`, for a script or a bug report). Reads
 * only: this command never writes to the log it shows.
 */

export interface ShowOptions {
  readonly lines?: string;
  readonly level?: string;
  readonly since?: string;
  readonly grep?: string;
  readonly json?: boolean;
}

const DEFAULT_LINES = 50;
export const DEFAULT_SINCE = "7d";
const MAX_LINES = 10_000;
const USAGE_EXIT_CODE = 2;
const FAILURE_EXIT_CODE = 1;

export async function showLog(options: ShowOptions): Promise<number> {
  const query = queryOf(options, new Date());
  if (typeof query === "string") return fail(query, USAGE_EXIT_CODE);
  const dir = stateDir("logs");
  if (dir === null) return fail(LOG_MESSAGES.noDirectory, FAILURE_EXIT_CODE);
  try {
    printTail(await readLogTail(query, dir), options.json === true);
    return 0;
  } catch (error) {
    return fail(LOG_MESSAGES.unreadable(reasonOf(error)), FAILURE_EXIT_CODE);
  }
}

function printTail(tail: LogTail, isJson: boolean): void {
  const render = isJson ? (record: LogRecord) => JSON.stringify(record) : logRecordText;
  if (tail.records.length === 0) process.stdout.write(`${chalk.dim(LOG_MESSAGES.empty)}\n`);
  for (const record of tail.records) process.stdout.write(`${render(record)}\n`);
  if (tail.malformed > 0) {
    process.stderr.write(`${chalk.dim(LOG_MESSAGES.malformed(tail.malformed))}\n`);
  }
}

/** The query the options describe, or the message saying which one is wrong. */
function queryOf(options: ShowOptions, now: Date): LogQuery | string {
  const rawLines = options.lines ?? String(DEFAULT_LINES);
  const limit = limitOf(rawLines);
  if (limit === null) return LOG_MESSAGES.badLines(rawLines);
  const minLevel = levelOf(options.level);
  if (minLevel === null) return LOG_MESSAGES.badLevel(options.level ?? "");
  const rawSince = options.since ?? DEFAULT_SINCE;
  const period = parsePeriod(rawSince, now);
  if (period === null) return LOG_MESSAGES.badSince(rawSince);
  return {
    limit,
    since: period.since,
    ...(minLevel !== undefined && { minLevel }),
    ...(options.grep && { grep: options.grep }),
  };
}

/** `--lines` as a count in 1..10000, or null. */
function limitOf(raw: string): number | null {
  const limit = Number(raw);
  return Number.isInteger(limit) && limit >= 1 && limit <= MAX_LINES ? limit : null;
}

/** `--level`: undefined when absent, null when it is not a level. */
function levelOf(raw: string | undefined): LogLevel | undefined | null {
  if (raw === undefined) return undefined;
  const level = raw.trim().toLowerCase();
  return isLogLevel(level) ? level : null;
}

function fail(message: string, code: number): number {
  process.stderr.write(`${chalk.red(ERROR_PREFIX)} ${message}\n`);
  return code;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
