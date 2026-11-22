import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NewFeedback } from "../../src/domain/feedback.js";
import { validateLogBatch } from "../../src/domain/validate-log-batch.js";
import type { LogBatch } from "../../src/domain/journal.js";
import { sha256 } from "../../src/security/sha256.js";
import { PgFeedbackRepository } from "../../src/store/feedback/pg-feedback-repository.js";
import { PgOutboxRepository } from "../../src/store/feedback/pg-outbox-repository.js";
import { migrate } from "../../src/store/migrate.js";
import { PgInstallReader } from "../../src/store/pg-install-reader.js";
import { PgInstallStore } from "../../src/store/pg-install-store.js";
import { PgRetentionStore } from "../../src/store/pg-retention-store.js";
import { PgSessionRepository } from "../../src/store/pg-session-repository.js";
import { DURATION_MS } from "../../src/time-units.js";

/**
 * Runs against a throwaway database only: it drops the `public` schema.
 *   docker run -d --rm --name gup-feedback-test-pg -e POSTGRES_PASSWORD=test \
 *     -p 127.0.0.1:55432:5432 postgres:18-alpine
 *   FEEDBACK_TEST_DATABASE_URL=postgres://postgres:test@127.0.0.1:55432/postgres
 */
const DATABASE_URL = process.env["FEEDBACK_TEST_DATABASE_URL"];
const INSTALL_ID = "8c1d4f2e-3b5a-4c6d-8e7f-9a0b1c2d3e4f";
const OTHER_INSTALL_ID = "0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0";
const DAY_MS = DURATION_MS.day;
const FEEDBACK: NewFeedback = {
  kind: "bug", title: "Broken", message: "Something is broken.", email: "a@example.com",
  installId: INSTALL_ID, gupVersion: "0.6.0", platform: "win32", locale: "fr",
};

function exampleBatch(): LogBatch {
  const url = new URL("../../contract/log-batch.v1.example.json", import.meta.url);
  const validation = validateLogBatch(JSON.parse(readFileSync(url, "utf8")));
  if (!validation.ok) throw new Error("the contract example no longer validates");
  return validation.value;
}

describe.skipIf(DATABASE_URL === undefined)("Postgres store", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const feedback = new PgFeedbackRepository(pool);
  const installs = new PgInstallStore(pool);

  beforeAll(async () => {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await migrate(pool);
    await pool.query("TRUNCATE feedback, mail_outbox, install, admin_session RESTART IDENTITY CASCADE");
  });

  it("migrates an empty database once, then finds nothing to apply", async () => {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    expect(await migrate(pool)).toEqual(["001_initial.sql"]);
    expect(await migrate(pool)).toEqual([]);
  });

  it("round-trips a feedback and queues its mail in the same write", async () => {
    const id = await feedback.create(FEEDBACK);
    await feedback.updateStatus(id, "in_progress");
    await feedback.updateNote(id, "Looking into it.");
    expect(await feedback.find(id)).toMatchObject({
      ...FEEDBACK, id, status: "in_progress", note: "Looking into it.",
    });
    const page = await feedback.list({ status: "in_progress", kind: null, page: 1, pageSize: 20 });
    expect(page.total).toBe(1);
    expect(await feedback.countByStatus(null)).toMatchObject({ in_progress: 1, new: 0 });
    const outbox = await pool.query("SELECT feedback_id FROM mail_outbox");
    expect(outbox.rows).toEqual([{ feedback_id: String(id) }]);
  });

  it("creates the install with its first batch and stores each item once", async () => {
    const batch = exampleBatch();
    const command = { installId: INSTALL_ID, batch, mayCreateInstall: true };
    const first = await installs.storeBatch(command);
    const again = await installs.storeBatch({ ...command, mayCreateInstall: false });
    expect(first).toEqual({ kind: "stored", accepted: { history: 2, logs: 2 }, isNewInstall: true });
    expect(again).toEqual({ kind: "stored", accepted: { history: 0, logs: 0 }, isNewInstall: false });
    const reader = new PgInstallReader(pool);
    expect(await reader.find(INSTALL_ID)).toMatchObject({ platform: "win32", historyCount: 2 });
    const logs = await reader.listLogs({ installId: INSTALL_ID, maxLevelRank: 1, page: 1, pageSize: 50 });
    expect(logs.items.map((item) => item.event)).toEqual(["update.failed"]);
  });

  it("never creates an install from an empty batch, nor once creation is refused", async () => {
    const empty = { ...exampleBatch(), history: [], logs: [] };
    const fromEmpty = await installs.storeBatch({
      installId: INSTALL_ID, batch: empty, mayCreateInstall: true,
    });
    const refused = await installs.storeBatch({
      installId: OTHER_INSTALL_ID, batch: exampleBatch(), mayCreateInstall: false,
    });
    expect(fromEmpty).toEqual({
      kind: "stored", accepted: { history: 0, logs: 0 }, isNewInstall: false,
    });
    expect(refused).toEqual({ kind: "creation_refused" });
    expect((await pool.query("SELECT id FROM install")).rowCount).toBe(0);
  });

  it("erases an install with everything uploaded for it, and ignores an unknown one", async () => {
    await installs.storeBatch({ installId: INSTALL_ID, batch: exampleBatch(), mayCreateInstall: true });
    await installs.remove(INSTALL_ID);
    await installs.remove(OTHER_INSTALL_ID);
    const left = await pool.query(
      "SELECT (SELECT count(*) FROM install) + (SELECT count(*) FROM install_log_item) AS n");
    expect(left.rows).toEqual([{ n: "0" }]);
  });

  it("purges journal items past retention, then the install left empty", async () => {
    await installs.storeBatch({ installId: INSTALL_ID, batch: exampleBatch(), mayCreateInstall: true });
    const now = new Date();
    await pool.query("UPDATE install_log_item SET received_at = $1", [new Date(now.getTime() - 100 * DAY_MS)]);
    const cutoff = new Date(now.getTime() - 90 * DAY_MS);
    const window = { journalCutoff: cutoff, now, sessionIdleCutoff: now };
    const first = await new PgRetentionStore(pool).purge(window);
    expect(first).toMatchObject({ historyItems: 0, logItems: 2, installs: 0 });
    await pool.query("UPDATE install_history_item SET received_at = $1", [new Date(now.getTime() - 100 * DAY_MS)]);
    await pool.query("UPDATE install SET last_seen_at = $1", [new Date(now.getTime() - 100 * DAY_MS)]);
    const second = await new PgRetentionStore(pool).purge(window);
    expect(second).toMatchObject({ historyItems: 2, installs: 1 });
  });

  it("round-trips an admin session and purges it once idle", async () => {
    const sessions = new PgSessionRepository(pool);
    const now = new Date();
    const tokenHash = sha256("token");
    const expiresAt = new Date(now.getTime() + 7 * DAY_MS);
    await sessions.create({ tokenHash, csrfToken: "csrf", createdAt: now, lastSeenAt: now, expiresAt });
    const later = new Date(now.getTime() + DAY_MS);
    await sessions.touch(tokenHash, later);
    expect(await sessions.find(tokenHash)).toMatchObject({ csrfToken: "csrf", lastSeenAt: later });
    const window = { journalCutoff: now, now: later, sessionIdleCutoff: later };
    expect(await new PgRetentionStore(pool).purge(window)).toMatchObject({ sessions: 1 });
    expect(await sessions.find(tokenHash)).toBeNull();
  });

  it("hands a due mail to one claimer only, and hides it for the lease", async () => {
    for (let i = 0; i < 4; i += 1) await feedback.create(FEEDBACK);
    const outbox = new PgOutboxRepository(pool);
    const request = { now: new Date(Date.now() + 1000), limit: 3, leaseMs: 60_000, maxAttempts: 8 };
    const [a, b] = await Promise.all([outbox.claimDue(request), outbox.claimDue(request)]);
    const claimed = [...a, ...b].map((mail) => mail.id);
    expect(new Set(claimed).size).toBe(claimed.length);
    expect(claimed).toHaveLength(4);
    expect(a[0]?.attempts).toBe(1);
    expect(await outbox.claimDue(request)).toEqual([]);
  });
});
