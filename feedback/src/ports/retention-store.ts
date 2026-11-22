export interface PurgeWindow {
  /** Journal items received before this go, as do installs left empty and unseen since. */
  readonly journalCutoff: Date;
  /** Sessions past their absolute expiry at this instant go. */
  readonly now: Date;
  /** Sessions idle since before this go. */
  readonly sessionIdleCutoff: Date;
}

export interface PurgeReport {
  readonly historyItems: number;
  readonly logItems: number;
  readonly installs: number;
  readonly sessions: number;
}

export interface RetentionStore {
  purge(window: PurgeWindow): Promise<PurgeReport>;
}
