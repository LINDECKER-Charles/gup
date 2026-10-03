import chalk from "chalk";
import type { LogLevel } from "../core/log/log.js";
import type { LogData, LogRecord, LogValue } from "../core/log/types.js";
import { formatDuration } from "./text/fr-format.js";
import {
  COMMAND_END_LABELS,
  ELEVATED_MARK,
  LEVEL_LABELS,
  UPDATE_STATUS_LABELS,
} from "./text/log-labels.js";
import { fit, seg, type Line, type Segment, type Tone } from "./tui/styled-lines.js";

/**
 * One debug log record as one readable line — `03/10 14:22:23.512  INFO
 * cmd.end  [winget] exit 0 · 18,4 s` — for `gup log` and the journal view's
 * Debug tab. Known events get a summary written for a human; any other one
 * lists its data as `key=value` pairs.
 */

const LEVEL_WIDTH = 6;
const EVENT_WIDTH = 14;
const PATH_SEPARATORS = /[\\/]/;

const LEVEL_TONES: Readonly<Record<LogLevel, Tone>> = {
  error: "danger",
  warn: "warning",
  info: "plain",
  debug: "muted",
  trace: "muted",
};

const PAINT: Readonly<Record<Tone, (value: string) => string>> = {
  plain: (value) => value,
  strong: (value) => chalk.bold(value),
  muted: (value) => chalk.dim(value),
  disabled: (value) => chalk.gray(value),
  accent: (value) => chalk.cyan(value),
  success: (value) => chalk.green(value),
  warning: (value) => chalk.yellow(value),
  danger: (value) => chalk.red(value),
  onAccent: (value) => chalk.inverse(value),
};

type Summary = (data: LogData) => string;

const SUMMARIES: Readonly<Record<string, Summary>> = {
  "cmd.start": commandLine,
  "cmd.end": commandEndSummary,
  "update.start": (data) => `${updateSubject(data)}${versions(data)}`,
  "update.end": updateEndSummary,
  "session.start": (data) => [text(data["command"]) || "menu", text(data["trigger"])].join(" · "),
  "session.end": (data) => `code ${text(data["code"])} · ${duration(data["ms"])}`,
  "session.crash": (data) => text(field(data["error"], "message")),
};

export function levelLabel(level: LogLevel): string {
  return LEVEL_LABELS[level];
}

/** The record as styled segments; with a `width`, the summary is cut to fit it. */
export function logRecordLine(record: LogRecord, width?: number): Line {
  const head: Segment[] = [
    seg(`${timeOf(record.ts)}  `, "muted"),
    seg(`${levelLabel(record.level).padEnd(LEVEL_WIDTH)} `, LEVEL_TONES[record.level]),
    seg(`${record.event.padEnd(EVENT_WIDTH)} `, "strong"),
  ];
  const used = head.reduce((total, segment) => total + segment.text.length, 0);
  const summary = summaryOf(record);
  const fitted = width === undefined ? summary : fit(summary, Math.max(0, width - used)).trimEnd();
  return [...head, seg(fitted, record.level === "error" ? "danger" : "plain")];
}

/** The record as one line of terminal text; uncoloured under `NO_COLOR` or into a pipe. */
export function logRecordText(record: LogRecord): string {
  return logRecordLine(record)
    .map((segment) => PAINT[segment.tone](segment.text))
    .join("")
    .trimEnd();
}

function summaryOf(record: LogRecord): string {
  const data = record.data ?? {};
  const summary = (SUMMARIES[record.event] ?? pairs)(data);
  const scope = record.ctx?.providerId;
  const prefix = [record.elevated ? ELEVATED_MARK : "", scope ? `[${scope}]` : ""];
  return [...prefix.filter(Boolean), summary].join(" ");
}

/** The program's own name (not its folder) and its arguments. */
function commandLine(data: LogData): string {
  const program = text(data["cmd"]).split(PATH_SEPARATORS).at(-1) ?? "";
  return [program, ...list(data["args"])].join(" ");
}

function commandEndSummary(data: LogData): string {
  const parts = [commandLine(data), `exit ${text(data["exitCode"])}`, duration(data["ms"])];
  if (data["timedOut"] === true) parts.push(COMMAND_END_LABELS.timedOut);
  if (data["aborted"] === true) parts.push(COMMAND_END_LABELS.aborted);
  const output = lastLine(data["stderrTail"] ?? data["outputTail"]);
  if (output) parts.push(output);
  return parts.join(" · ");
}

function updateEndSummary(data: LogData): string {
  const status = text(data["status"]);
  const parts = [updateSubject(data), statusLabel(status)];
  if (typeof data["ms"] === "number") parts.push(duration(data["ms"]));
  if (data["message"] !== undefined) parts.push(text(data["message"]));
  return parts.join(" · ");
}

function updateSubject(data: LogData): string {
  return `${text(data["providerId"])} · ${text(data["packageId"])}`;
}

function versions(data: LogData): string {
  const from = text(data["from"]);
  const to = text(data["to"]);
  return from || to ? ` ${from || "?"} → ${to || "?"}` : "";
}

function statusLabel(status: string): string {
  return status in UPDATE_STATUS_LABELS
    ? UPDATE_STATUS_LABELS[status as keyof typeof UPDATE_STATUS_LABELS]
    : status;
}

/** Scalar fields as `key=value`, in record order. */
function pairs(data: LogData): string {
  return Object.entries(data)
    .filter(([, value]) => value === null || typeof value !== "object")
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
}

function duration(value: LogValue | undefined): string {
  return typeof value === "number" ? formatDuration(value) : "?";
}

/** The last non-empty line of a captured output: what usually names the error. */
function lastLine(value: LogValue | undefined): string {
  const lines = text(value).split(/\r?\n/).map((line) => line.trim());
  return lines.filter(Boolean).at(-1) ?? "";
}

function field(value: LogValue | undefined, key: string): LogValue | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as LogData)[key]
    : undefined;
}

function list(value: LogValue | undefined): string[] {
  return Array.isArray(value) ? value.map((item) => text(item)) : [];
}

function text(value: LogValue | undefined): string {
  if (value === undefined || value === null) return "";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

/** `03/10 14:22:05.112`, in local time. */
function timeOf(ts: string): string {
  const date = new Date(ts);
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  const day = `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  return `${day} ${time}.${pad(date.getMilliseconds(), 3)}`;
}
