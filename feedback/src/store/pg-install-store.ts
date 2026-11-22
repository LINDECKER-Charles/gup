import type { Pool, PoolClient } from "pg";
import type { ClientMeta, HistoryItem, LogBatch, LogItem } from "../domain/journal.js";
import type {
  InstallStore, StoreBatchCommand, StoreBatchOutcome,
} from "../ports/install-store.js";
import { withTransaction } from "./with-transaction.js";

/** A known install is locked against a concurrent erase until the batch commits. */
const LOCK_INSTALL = "SELECT 1 FROM install WHERE id = $1 FOR KEY SHARE";
/** A concurrent first batch of the same install waits here, then finds it known. */
const CREATE_INSTALL = "INSERT INTO install (id) VALUES ($1) ON CONFLICT (id) DO NOTHING";
const NOTHING_ACCEPTED = { history: 0, logs: 0 } as const;

type InstallClaim = "known" | "created" | "refused";

/** Whole batch in one statement per table; duplicates fall on the unique index. */
const INSERT_HISTORY = `INSERT INTO install_history_item
    (install_id, item_hash, ts, run_id, kind, status, data)
  SELECT $1, decode(t.hash, 'hex'), t.ts, t.run_id, t.kind, t.status, t.data::jsonb
  FROM unnest($2::text[], $3::timestamptz[], $4::text[], $5::text[], $6::text[], $7::text[])
    AS t(hash, ts, run_id, kind, status, data)
  ON CONFLICT ON CONSTRAINT install_history_item_dedupe DO NOTHING`;

const INSERT_LOGS = `INSERT INTO install_log_item
    (install_id, item_hash, ts, run_id, level_rank, event, data)
  SELECT $1, decode(t.hash, 'hex'), t.ts, t.run_id, t.level_rank, t.event, t.data::jsonb
  FROM unnest($2::text[], $3::timestamptz[], $4::text[], $5::smallint[], $6::text[], $7::text[])
    AS t(hash, ts, run_id, level_rank, event, data)
  ON CONFLICT ON CONSTRAINT install_log_item_dedupe DO NOTHING`;

/** A field the client left out keeps its last known value. */
const REFRESH_METADATA = `UPDATE install SET
    gup_version = COALESCE($2, gup_version), platform = COALESCE($3, platform),
    arch = COALESCE($4, arch), node_version = COALESCE($5, node_version),
    locale = COALESCE($6, locale), last_seen_at = now()
  WHERE id = $1`;

async function insertHistory(client: PoolClient, installId: string, items: readonly HistoryItem[]) {
  if (items.length === 0) return 0;
  const result = await client.query(INSERT_HISTORY, [installId,
    items.map((item) => item.hash), items.map((item) => item.ts.toISOString()),
    items.map((item) => item.runId), items.map((item) => item.kind),
    items.map((item) => item.status), items.map((item) => item.json)]);
  return result.rowCount ?? 0;
}

async function insertLogs(client: PoolClient, installId: string, items: readonly LogItem[]) {
  if (items.length === 0) return 0;
  const result = await client.query(INSERT_LOGS, [installId,
    items.map((item) => item.hash), items.map((item) => item.ts.toISOString()),
    items.map((item) => item.runId), items.map((item) => item.levelRank),
    items.map((item) => item.event), items.map((item) => item.json)]);
  return result.rowCount ?? 0;
}

async function refreshMetadata(client: PoolClient, installId: string, meta: ClientMeta) {
  await client.query(REFRESH_METADATA,
    [installId, meta.gupVersion, meta.platform, meta.arch, meta.node, meta.locale]);
}

async function claimInstall(
  client: PoolClient, command: StoreBatchCommand,
): Promise<InstallClaim> {
  const known = await client.query(LOCK_INSTALL, [command.installId]);
  if (known.rowCount === 1) return "known";
  if (!command.mayCreateInstall) return "refused";
  const created = await client.query(CREATE_INSTALL, [command.installId]);
  return created.rowCount === 1 ? "created" : "known";
}

function isEmptyBatch(batch: LogBatch): boolean {
  return batch.history.length === 0 && batch.logs.length === 0;
}

export class PgInstallStore implements InstallStore {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  /** An empty batch only refreshes a known install's metadata: it never creates one. */
  storeBatch(command: StoreBatchCommand): Promise<StoreBatchOutcome> {
    const { installId, batch } = command;
    return withTransaction(this.#pool, async (client) => {
      if (isEmptyBatch(batch)) {
        await refreshMetadata(client, installId, batch.client);
        return { kind: "stored", accepted: NOTHING_ACCEPTED, isNewInstall: false };
      }
      const claim = await claimInstall(client, command);
      if (claim === "refused") return { kind: "creation_refused" };
      const history = await insertHistory(client, installId, batch.history);
      const logs = await insertLogs(client, installId, batch.logs);
      await refreshMetadata(client, installId, batch.client);
      return { kind: "stored", accepted: { history, logs }, isNewInstall: claim === "created" };
    });
  }

  async remove(installId: string): Promise<void> {
    await this.#pool.query("DELETE FROM install WHERE id = $1", [installId]);
  }
}
