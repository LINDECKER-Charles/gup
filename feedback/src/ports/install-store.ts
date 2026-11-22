import type { AcceptedCounts, LogBatch } from "../domain/journal.js";

export interface StoreBatchCommand {
  /** Authenticated by the caller: the request was signed by this install's key. */
  readonly installId: string;
  readonly batch: LogBatch;
  /** false when the caller may not create one more install: an unknown one is refused. */
  readonly mayCreateInstall: boolean;
}

export type StoreBatchOutcome =
  | { readonly kind: "stored"; readonly accepted: AcceptedCounts; readonly isNewInstall: boolean }
  | { readonly kind: "creation_refused" };

/** The write side of shared journals, driven by the CLI's uploads. */
export interface InstallStore {
  /**
   * Stores the new items (duplicates skipped) and refreshes the install's
   * metadata, all or nothing. The first non-empty batch creates the install;
   * an empty one never does.
   */
  storeBatch(command: StoreBatchCommand): Promise<StoreBatchOutcome>;
  /** Erases the install and everything uploaded for it; a no-op when unknown. */
  remove(installId: string): Promise<void>;
}
