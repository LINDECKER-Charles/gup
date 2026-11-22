import type { HistoryKind } from "../domain/journal.js";
import type { Page, PageRequest } from "./page.js";

export interface InstallSummary {
  readonly id: string;
  readonly gupVersion: string | null;
  readonly platform: string | null;
  readonly arch: string | null;
  readonly node: string | null;
  readonly locale: string | null;
  readonly firstSeenAt: Date;
  /** Last upload. */
  readonly lastSeenAt: Date;
  readonly historyCount: number;
  readonly logCount: number;
  readonly feedbackCount: number;
}

/** A stored journal item, as the back office shows it. */
export interface StoredRecord {
  readonly id: number;
  readonly ts: Date;
  readonly runId: string;
  /** The whole record as the CLI sent it, envelope included. */
  readonly data: Readonly<Record<string, unknown>>;
}

export interface StoredHistoryRecord extends StoredRecord {
  readonly kind: HistoryKind;
  readonly status: string | null;
}

export interface StoredLogRecord extends StoredRecord {
  readonly levelRank: number;
  readonly event: string;
}

export interface HistoryQuery extends PageRequest {
  readonly installId: string;
  /** null = both kinds. */
  readonly kind: HistoryKind | null;
  /** null = any status. */
  readonly status: string | null;
}

export interface LogQuery extends PageRequest {
  readonly installId: string;
  /** Records at this rank or less verbose (0 = error only, 4 = everything). */
  readonly maxLevelRank: number;
  /**
   * Absent or null = no search. Otherwise matches, ignoring case and taking
   * `%`, `_` and `\` literally, a part of the event name or of any key or
   * value of the record.
   */
  readonly search?: string | null;
}

/** How many history items one (kind, status) pair holds: the filters' counts. */
export interface HistoryBreakdownCell {
  readonly kind: HistoryKind;
  readonly status: string | null;
  readonly count: number;
}

/** What the stored journals of an install cover. */
export interface JournalSpan {
  /** Oldest and newest `ts` across history items and log lines; null when none is left. */
  readonly oldestAt: Date | null;
  readonly newestAt: Date | null;
  /** Earliest reception: the retention purge removes this item first. */
  readonly oldestReceivedAt: Date | null;
  /** Distinct run IDs. */
  readonly runCount: number;
}

export interface RunKey {
  readonly installId: string;
  readonly runId: string;
}

export type RunQuery = RunKey & PageRequest;

/** One run of gup, as its stored records tell it. */
export interface RunSummary extends RunKey {
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly historyCount: number;
  readonly logCount: number;
  /** Log lines at the `error` level. */
  readonly errorCount: number;
  /** Update records whose status is `failed`. */
  readonly failedUpdateCount: number;
}

export type RunEntry =
  | { readonly source: "history"; readonly record: StoredHistoryRecord }
  | { readonly source: "log"; readonly record: StoredLogRecord };

/**
 * The read side of shared journals, for the back office. Lists are newest
 * first, except a run (its story reads oldest first) and the streams (exports).
 */
export interface InstallReader {
  list(request: PageRequest): Promise<Page<InstallSummary>>;
  find(installId: string): Promise<InstallSummary | null>;
  listHistory(query: HistoryQuery): Promise<Page<StoredHistoryRecord>>;
  listLogs(query: LogQuery): Promise<Page<StoredLogRecord>>;
  historyBreakdown(installId: string): Promise<readonly HistoryBreakdownCell[]>;
  journalSpan(installId: string): Promise<JournalSpan>;
  /** null when the install holds no record of that run. */
  findRun(key: RunKey): Promise<RunSummary | null>;
  /** Every history item and log line of the run, oldest first; at equal times, logs first. */
  listRun(query: RunQuery): Promise<Page<RunEntry>>;
  /** Every history item, oldest first, read in chunks: memory stays flat. */
  streamHistory(installId: string): AsyncIterable<StoredHistoryRecord>;
  /** Every log line, oldest first, read in chunks. */
  streamLogs(installId: string): AsyncIterable<StoredLogRecord>;
}
