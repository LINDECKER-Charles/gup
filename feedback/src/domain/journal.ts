import type { ClientFacts } from "./feedback.js";

/** Vocabulary of the uploaded journals. */
export const JOURNAL_VOCABULARY = {
  /** Least verbose first, as in the CLI (src/core/log/types.ts): a level's index is its rank. */
  logLevels: ["error", "warn", "info", "debug", "trace"],
  historyKinds: ["scan", "update"],
} as const;

export type LogLevel = (typeof JOURNAL_VOCABULARY.logLevels)[number];
export type HistoryKind = (typeof JOURNAL_VOCABULARY.historyKinds)[number];

/** What the CLI says about itself in an upload. */
export interface ClientMeta extends ClientFacts {
  arch: string | null;
  node: string | null;
}

/** One uploaded record, checked and ready to store. */
export interface JournalItem {
  /** sha256 of the record's canonical JSON, hex: the per-install deduplication key. */
  hash: string;
  ts: Date;
  runId: string;
  /** The record as received, serialised. */
  json: string;
}

export interface HistoryItem extends JournalItem {
  kind: HistoryKind;
  /** `status` of an update record (`success`, `failed`, `skipped`), null for a scan. */
  status: string | null;
}

export interface LogItem extends JournalItem {
  levelRank: number;
  event: string;
}

export interface LogBatch {
  client: ClientMeta;
  history: HistoryItem[];
  logs: LogItem[];
}

export interface AcceptedCounts {
  history: number;
  logs: number;
}
