import type { HistoryEvent, UpdateEvent } from "../history/types.js";
import { redactText } from "../log/redact.js";

/**
 * The update attempts of the history as a spreadsheet (RFC 4180): one row
 * per attempt, English snake_case columns (a data schema, not interface
 * text), a UTF-8 byte-order mark and CRLF rows so Excel opens it right.
 *
 * Safe to open: a text cell starting like a formula (`=`, `+`, `-`, `@`, a
 * tab or a carriage return) is prefixed with `'` (OWASP's CSV injection
 * advice), and the free text — package ids, versions, messages, retry
 * labels — is redacted again (secrets, home directory → `~`).
 */

export type CsvDelimiter = "," | ";" | "\t";

export interface CsvOptions {
  readonly delimiter: CsvDelimiter;
  /** The display name of a provider (`winget` → `Windows Package Manager`). */
  readonly nameOf: (providerId: string) => string;
}

export const CSV_COLUMNS = [
  "ts",
  "provider_id",
  "provider",
  "package_id",
  "status",
  "from",
  "to",
  "duration_ms",
  "message",
  "retry",
  "elevated",
  "run_id",
  "trigger",
  "schedule_id",
] as const;

const BYTE_ORDER_MARK = "﻿";
const ROW_END = "\r\n";
const FORMULA_START = /^[=+\-@\t\r]/;
const QUOTE = '"';

export function updatesToCsv(events: readonly HistoryEvent[], options: CsvOptions): string {
  const rows = [CSV_COLUMNS.join(options.delimiter)];
  for (const event of events) {
    if (event.kind === "update") rows.push(updateRow(event, options));
  }
  return `${BYTE_ORDER_MARK}${rows.join(ROW_END)}${ROW_END}`;
}

function updateRow(event: UpdateEvent, { delimiter, nameOf }: CsvOptions): string {
  const free = (value: string | undefined) => (value === undefined ? "" : redactText(value));
  const cells: Record<(typeof CSV_COLUMNS)[number], string> = {
    ts: event.ts,
    provider_id: event.providerId,
    provider: nameOf(event.providerId),
    package_id: free(event.packageId),
    status: event.status,
    from: free(event.from),
    to: free(event.to),
    duration_ms: event.durationMs === undefined ? "" : String(event.durationMs),
    message: free(event.message),
    retry: free(event.retry),
    elevated: event.elevated === true ? "true" : "false",
    run_id: event.runId,
    trigger: event.trigger ?? "",
    schedule_id: event.scheduleId ?? "",
  };
  return CSV_COLUMNS.map((column) => cell(cells[column], delimiter)).join(delimiter);
}

/** A cell neutralised against formula injection, quoted around a delimiter, a quote or a break. */
function cell(value: string, delimiter: CsvDelimiter): string {
  const neutral = FORMULA_START.test(value) ? `'${value}` : value;
  const needsQuotes =
    neutral.includes(delimiter) || neutral.includes(QUOTE) || /[\r\n]/.test(neutral);
  return needsQuotes ? `${QUOTE}${neutral.replaceAll(QUOTE, QUOTE + QUOTE)}${QUOTE}` : neutral;
}
