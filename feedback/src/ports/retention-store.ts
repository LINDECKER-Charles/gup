export interface PurgeWindow {
  /** Journal items received before this go, as do installs left empty and unseen since. */
  readonly journalCutoff: Date;
  /** Sessions past their absolute expiry at this instant go. */
  readonly now: Date;
  /** Sessions idle since before this go. */
  readonly sessionIdleCutoff: Date;
  /** MCP accesses expired or revoked before this go. */
  readonly mcpAccessCutoff: Date;
}

export interface PurgeReport {
  readonly historyItems: number;
  readonly logItems: number;
  readonly installs: number;
  readonly sessions: number;
  readonly mcpAccesses: number;
}

export interface RetentionStore {
  purge(window: PurgeWindow): Promise<PurgeReport>;
}
