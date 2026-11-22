import { readdir, readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";

const MIGRATIONS_DIR = new URL("../../migrations/", import.meta.url);
const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;
/** Arbitrary, fixed: every instance of this service contends for the same lock. */
const MIGRATION_LOCK_KEY = 7_475_960_221;

async function pendingMigrations(client: PoolClient): Promise<string[]> {
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name       text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);
  const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
  const applied = new Set(rows.map((row) => row.name));
  const files = await readdir(MIGRATIONS_DIR);
  return files.filter((file) => MIGRATION_FILE.test(file) && !applied.has(file)).sort();
}

async function apply(client: PoolClient, name: string): Promise<void> {
  const sql = await readFile(new URL(name, MIGRATIONS_DIR), "utf8");
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw new Error(`migration ${name} failed: ${(error as Error).message}`, { cause: error });
  }
}

/**
 * Applies the SQL files of migrations/ not yet recorded in `schema_migrations`,
 * in name order, each in its own transaction. A session-level advisory lock
 * serialises concurrent starts (two replicas, a restart overlapping a deploy).
 * Returns the names applied — a report, so start-up can log it.
 */
export async function migrate(pool: Pool): Promise<readonly string[]> {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    const pending = await pendingMigrations(client);
    for (const name of pending) await apply(client, name);
    return pending;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY])
      .catch(() => undefined);
    client.release();
  }
}
