import type { Pool } from "pg";
import type { PurgeReport, PurgeWindow, RetentionStore } from "../ports/retention-store.js";
import { withTransaction } from "./with-transaction.js";

/** An install goes once nothing it uploaded remains and it has not uploaded since the cutoff. */
const DELETE_EMPTY_INSTALLS = `DELETE FROM install i
  WHERE i.last_seen_at < $1
    AND NOT EXISTS (SELECT 1 FROM install_history_item h WHERE h.install_id = i.id)
    AND NOT EXISTS (SELECT 1 FROM install_log_item l WHERE l.install_id = i.id)`;

export class PgRetentionStore implements RetentionStore {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  purge(window: PurgeWindow): Promise<PurgeReport> {
    return withTransaction(this.#pool, async (client) => {
      const { journalCutoff, now, sessionIdleCutoff, mcpAccessCutoff } = window;
      const history = await client.query(
        "DELETE FROM install_history_item WHERE received_at < $1", [journalCutoff]);
      const logs = await client.query(
        "DELETE FROM install_log_item WHERE received_at < $1", [journalCutoff]);
      const installs = await client.query(DELETE_EMPTY_INSTALLS, [journalCutoff]);
      const sessions = await client.query(
        "DELETE FROM admin_session WHERE expires_at <= $1 OR last_seen_at <= $2",
        [now, sessionIdleCutoff]);
      const accesses = await client.query(
        "DELETE FROM mcp_access WHERE coalesce(revoked_at, expires_at) < $1", [mcpAccessCutoff]);
      return {
        historyItems: history.rowCount ?? 0,
        logItems: logs.rowCount ?? 0,
        installs: installs.rowCount ?? 0,
        sessions: sessions.rowCount ?? 0,
        mcpAccesses: accesses.rowCount ?? 0,
      };
    });
  }
}
