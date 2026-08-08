/**
 * On-disk schema of the activity history.
 *
 * The history is an append-only JSONL log: one self-describing JSON object per
 * line, never rewritten. That shape is chosen for what comes next — feeding a
 * chart or a report — and for what runs today: several gup processes (the main
 * one plus the elevated child) can append concurrently without a lock, and a
 * line torn by a crash costs exactly that line.
 *
 * Every record carries {@link HISTORY_SCHEMA_VERSION} so a later reader can
 * tell a v1 line from a v2 one instead of guessing from the fields present.
 */

/** Bump on any change that a v1 reader could not interpret correctly. */
export const HISTORY_SCHEMA_VERSION = 1;

/** Fields shared by every record, whatever it describes. */
export interface HistoryEnvelope {
  /** Schema version — {@link HISTORY_SCHEMA_VERSION} at write time. */
  v: number;
  /** Event instant, ISO 8601 in UTC. */
  ts: string;
  /**
   * Identifies the gup process that emitted the record. Lets a reader stitch a
   * scan back to the updates it led to, which no timestamp comparison can do
   * reliably once two sessions overlap.
   */
  runId: string;
  /** gup version that produced the record. */
  gup: string;
  /** `process.platform` — the same machine can log from Windows and from WSL. */
  platform: string;
  kind: "scan" | "update";
}

/** Per-provider slice of a scan. */
export interface ScanProviderRecord {
  providerId: string;
  /** Number of outdated packages the provider reported. */
  outdated: number;
  /** Set when the provider was reachable but its scan failed. */
  error?: string;
}

/** One completed scan of the machine, whatever triggered it. */
export interface ScanEvent extends HistoryEnvelope {
  kind: "scan";
  durationMs: number;
  /** `--fast` was in effect, so slow providers were skipped. */
  fast: boolean;
  /** Provider filter in effect; empty means "every detected provider". */
  filter: string[];
  providers: ScanProviderRecord[];
  /** Total outdated packages across providers — denormalised on purpose so a
   * reader can plot the headline number without summing the array. */
  outdated: number;
}

export type UpdateStatus = "success" | "failed" | "skipped";

/** One update attempt on one package. */
export interface UpdateEvent extends HistoryEnvelope {
  kind: "update";
  providerId: string;
  packageId: string;
  status: UpdateStatus;
  /** Installed version before the attempt, when the scan knew it. */
  from?: string;
  /** Version the attempt targeted, when the scan knew it. */
  to?: string;
  durationMs?: number;
  /** Failure cause or skip reason, verbatim from the provider. */
  message?: string;
  /** Retry strategy label when the attempt was a retry pass, absent otherwise. */
  retry?: string;
  /** True when the attempt went through the elevated (UAC / sudo) batch. */
  elevated?: boolean;
}

export type HistoryEvent = ScanEvent | UpdateEvent;
