import type { HistoryReadStats } from "../../../core/history/reader.js";
import type { HistoryEvent } from "../../../core/history/types.js";
import type { Insights } from "../../../core/insights/types.js";
import type { LogThreshold } from "../../../core/log/log.js";
import type { LogRecord } from "../../../core/log/types.js";
import type { Period } from "../../../core/time/period.js";
import type { LOG_SOURCE_LABELS } from "../../text/log-labels.js";

/**
 * What the journal view needs from the rest of gup, as a port: the
 * composition root (`commands/journal/journal-source.ts`) reads the history
 * and the debug log and writes exports; the panel only draws and asks. Both
 * calls never reject — a failure comes back as data the panel shows.
 */

export type ExportFormat = "json" | "csv" | "diagnostic";

export interface JournalHistory {
  readonly insights: Insights;
  /** Newest first, bounded. */
  readonly events: readonly HistoryEvent[];
  readonly stats: HistoryReadStats;
  /** Why the history could not be read; insights and events are then empty. */
  readonly error?: string;
  /** `GUP_HISTORY=0`: what exists is shown, nothing new is recorded. */
  readonly isRecordingOff: boolean;
}

export interface JournalLog {
  /** Newest first, bounded. */
  readonly records: readonly LogRecord[];
  /** What this run's log writes, and where that setting came from. */
  readonly threshold: LogThreshold;
  readonly source: keyof typeof LOG_SOURCE_LABELS;
  /** Lines that were not records. */
  readonly malformed: number;
  readonly error?: string;
}

export interface JournalData {
  readonly history: JournalHistory;
  readonly log: JournalLog;
}

export type ExportOutcome =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly error: string };

export interface JournalSource {
  load(period: Period): Promise<JournalData>;
  export(format: ExportFormat, period: Period): Promise<ExportOutcome>;
}
