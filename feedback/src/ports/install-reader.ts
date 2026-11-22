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
  readonly kind: HistoryKind;
  /** null = any status. */
  readonly status: string | null;
}

export interface LogQuery extends PageRequest {
  readonly installId: string;
  /** Records at this rank or less verbose (0 = error only, 4 = everything). */
  readonly maxLevelRank: number;
}

/** The read side of shared journals, for the back office. Newest first everywhere. */
export interface InstallReader {
  list(request: PageRequest): Promise<Page<InstallSummary>>;
  find(installId: string): Promise<InstallSummary | null>;
  listHistory(query: HistoryQuery): Promise<Page<StoredHistoryRecord>>;
  listLogs(query: LogQuery): Promise<Page<StoredLogRecord>>;
}
