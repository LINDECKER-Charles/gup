import { readFile } from "node:fs/promises";
import { readHistory } from "../history/reader.js";
import type { HistoryEvent } from "../history/types.js";
import { utcDay } from "../log/file-sink.js";
import { listLogFiles, parseLogLine } from "../log/log-reader.js";
import { resanitizeRecord } from "../log/sanitize-data.js";
import type { LogData, LogRecord, LogValue } from "../log/types.js";
import type { Period } from "../time/period.js";
import { redactHistoryEvent } from "./json-export.js";

/**
 * The journals an install shares with the maintainer, once the user agreed:
 * the history records and the debug-log records from the upload cursor's
 * instants on, oldest first, redacted again exactly as
 * `gup report --format json` and `gup log export` redact them — secrets
 * removed, the home directory shortened to `~`.
 *
 * Left out besides: a log line that is not a record gup wrote (as the
 * diagnostic archive leaves it out), the `sharing.*` records sharing itself
 * writes, and the environment — `session.start` keeps of its system snapshot
 * gup's version, Node's, the platform and the architecture only, never the
 * variables, paths or OS release the local log records. Nothing else is
 * read: not the settings file, not the process environment.
 */

export type JournalItem =
  | { readonly stream: "history"; readonly ts: string; readonly record: HistoryEvent }
  | { readonly stream: "logs"; readonly ts: string; readonly record: LogRecord };

export interface JournalQuery {
  /** History records stamped at or after this instant are taken. */
  readonly historyFrom: Date;
  /** Debug-log records stamped at or after this instant are taken. */
  readonly logsFrom: Date;
  readonly now: Date;
  /** The oldest records first, at most this many in all. */
  readonly limit: number;
  readonly dirs: { readonly history: string | null; readonly logs: string | null };
}

const LINE_BREAK = /\r?\n/;
const SHARING_EVENTS = "sharing.";
/** What a log record's `system` snapshot keeps: no environment, no OS release. */
const SHARED_SYSTEM_KEYS: ReadonlySet<string> = new Set(["gup", "node", "platform", "arch"]);
const ENVIRONMENT_KEYS = ["env", "system"] as const;

export async function collectSharedJournals(query: JournalQuery): Promise<JournalItem[]> {
  const [history, logs] = await Promise.all([historyItems(query), logItems(query)]);
  return [...history, ...logs].sort(byInstant).slice(0, query.limit);
}

async function historyItems(query: JournalQuery): Promise<JournalItem[]> {
  const period: Period = {
    key: "all",
    scope: { kind: "all" },
    since: query.historyFrom,
    until: query.now,
    hasFixedEnd: false,
  };
  const from = query.historyFrom.getTime();
  const { events } = await readHistory(period, query.dirs.history);
  return events
    .filter((event) => Date.parse(event.ts) >= from)
    .slice(0, query.limit)
    .map((event) => ({ stream: "history", ts: event.ts, record: redactHistoryEvent(event) }));
}

/** The log files from the cursor's day on, oldest first, until enough records are found. */
async function logItems(query: JournalQuery): Promise<JournalItem[]> {
  const dir = query.dirs.logs;
  if (dir === null) return [];
  const oldestDay = utcDay(query.logsFrom);
  const files = (await listLogFiles(dir)).filter((file) => file.day >= oldestDay).reverse();
  const items: JournalItem[] = [];
  for (const file of files) {
    if (items.length >= query.limit) break;
    // Pruned by another gup since the listing: nothing to read.
    const content = await readFile(file.path, "utf8").catch(() => "");
    items.push(...recordsFrom(content, query.logsFrom.getTime()));
  }
  return items.sort(byInstant).slice(0, query.limit);
}

function recordsFrom(content: string, from: number): JournalItem[] {
  const items: JournalItem[] = [];
  for (const line of content.split(LINE_BREAK)) {
    const record = line.length > 0 ? parseLogLine(line) : null;
    if (record === null || !isShared(record, from)) continue;
    const shared = withoutEnvironment(resanitizeRecord(record));
    items.push({ stream: "logs", ts: record.ts, record: shared });
  }
  return items;
}

function isShared(record: LogRecord, from: number): boolean {
  return Date.parse(record.ts) >= from && !record.event.startsWith(SHARING_EVENTS);
}

function withoutEnvironment(record: LogRecord): LogRecord {
  const data = record.data;
  if (data === undefined || !ENVIRONMENT_KEYS.some((key) => key in data)) return record;
  const { env: _env, system, ...rest } = data;
  const kept: LogData = system === undefined ? rest : { ...rest, system: sharedSystem(system) };
  return { ...record, data: kept };
}

function sharedSystem(system: LogValue): LogValue {
  if (typeof system !== "object" || system === null || Array.isArray(system)) return null;
  return Object.fromEntries(
    Object.entries(system).filter(([key]) => SHARED_SYSTEM_KEYS.has(key)),
  ) as LogValue;
}

function byInstant(a: JournalItem, b: JournalItem): number {
  return Date.parse(a.ts) - Date.parse(b.ts);
}
