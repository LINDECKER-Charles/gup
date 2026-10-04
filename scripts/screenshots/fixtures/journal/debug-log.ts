import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { logFileName, utcDay } from "../../../../src/core/log/file-sink.js";
import type { LogLevel } from "../../../../src/core/log/log.js";
import {
  LOG_SCHEMA_VERSION,
  type LogData,
  type LogRecord,
} from "../../../../src/core/log/types.js";
import { stateDir } from "../../../../src/core/state/app-dirs.js";
import type { OperationContext } from "../../../../src/core/state/run-context.js";
import { localDayKey } from "./fixture-days.js";

/** One line of the fixture log: local time of day, level, event, then the facts. */
type LogRow = readonly [
  time: string,
  level: LogLevel,
  event: string,
  provider: string | null,
  data: LogData,
];

/** Two runs of the day: the morning scan the history records, and the menu now open. */
const MORNING = { pid: 18244, suffix: "fixture" } as const;
const NOW_OPEN = { pid: 21508, suffix: "menu" } as const;
const SCOOP_ERROR = "scoop status a échoué (code 1)";
const SCOOP_STDERR = "Scoop is out of date. Run 'scoop update' to get the latest changes.";

const MORNING_ROWS: readonly LogRow[] = [
  ["09:00:00.112", "info", "session.start", null, { command: "", trigger: "menu" }],
  ["09:00:00.180", "info", "scan.start", null, { planned: 14, fast: false, filter: [] }],
  ["09:00:00.795", "debug", "scan.provider", "rustup", { ms: 600, outdated: 0 }],
  ["09:00:00.982", "debug", "cmd.end", "scoop", scoopStatus()],
  ["09:00:00.986", "warn", "scan.provider", "scoop", { ms: 800, outdated: 0, error: SCOOP_ERROR }],
  ["09:00:01.098", "debug", "scan.provider", "helm", { ms: 900, outdated: 0 }],
  ["09:00:01.385", "debug", "scan.provider", "npm-g", { ms: 1200, outdated: 3 }],
  ["09:00:01.985", "debug", "scan.provider", "cargo", { ms: 1800, outdated: 2 }],
  ["09:00:02.585", "debug", "scan.provider", "pipx", { ms: 2400, outdated: 2 }],
  ["09:00:03.285", "debug", "scan.provider", "winget", { ms: 3100, outdated: 4 }],
  ["09:00:04.185", "debug", "scan.provider", "choco", { ms: 4000, outdated: 1 }],
  ["09:00:06.580", "info", "scan.end", null, { ms: 6400, providers: 14, outdated: 12, errors: 1 }],
  ["09:02:13.402", "info", "session.end", null, { code: 0, ms: 133_290 }],
];

const NOW_OPEN_ROWS: readonly LogRow[] = [
  ["11:29:50.031", "info", "session.start", null, { command: "", trigger: "menu" }],
  ["11:29:50.104", "info", "scan.start", null, { planned: 14, fast: false, filter: [] }],
  ["11:29:51.010", "warn", "scan.provider", "scoop", { ms: 800, outdated: 0, error: SCOOP_ERROR }],
  ["11:29:56.511", "info", "scan.end", null, { ms: 6400, providers: 14, outdated: 12, errors: 1 }],
];

function scoopStatus(): LogData {
  return {
    mode: "probe",
    cmd: "scoop",
    args: ["status"],
    exitCode: 1,
    ms: 788,
    failed: true,
    stderrTail: SCOOP_STDERR,
  };
}

/**
 * Write the debug log of the fixture day where gup reads it (`GUP_LOG_DIR`,
 * the sandbox in the generator): this morning's run, then the menu's own
 * start, as the file sink writes them — one JSON record per line, in the
 * day's file. Written whole: writing it again changes nothing.
 */
export function writeDebugLogFixture(now: Date): void {
  const dir = stateDir("logs");
  if (dir === null) throw new Error("the debug log fixture has nowhere to go: no log directory");
  const records = [
    ...MORNING_ROWS.map((row) => recordOf(row, { day: now, ...MORNING })),
    ...NOW_OPEN_ROWS.map((row) => recordOf(row, { day: now, ...NOW_OPEN })),
  ];
  mkdirSync(dir, { recursive: true });
  const lines = records.map((record) => `${JSON.stringify(record)}\n`).join("");
  writeFileSync(join(dir, logFileName(utcDay(now), 0)), lines, "utf8");
}

interface Run {
  readonly day: Date;
  readonly pid: number;
  readonly suffix: string;
}

function recordOf([time, level, event, provider, data]: LogRow, run: Run): LogRecord {
  const ctx: OperationContext | null =
    provider === null ? null : { op: "scan", providerId: provider };
  return {
    v: LOG_SCHEMA_VERSION,
    ts: localInstant(run.day, time).toISOString(),
    level,
    event,
    runId: `${localDayKey(run.day)}-${run.suffix}`,
    pid: run.pid,
    ...(ctx !== null && { ctx }),
    data,
  };
}

/** `day` at `09:00:00.112`, local time. */
function localInstant(day: Date, time: string): Date {
  const [hours = 0, minutes = 0, seconds = 0, ms = 0] = time.split(/[:.]/).map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes, seconds, ms);
}
