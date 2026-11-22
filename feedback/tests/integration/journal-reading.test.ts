import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { NewFeedback } from "../../src/domain/feedback.js";
import { PgFeedbackRepository } from "../../src/store/feedback/pg-feedback-repository.js";
import { PgOutboxMonitor } from "../../src/store/feedback/pg-outbox-monitor.js";
import { migrate } from "../../src/store/migrate.js";
import { PgInstallReader } from "../../src/store/pg-install-reader.js";

/** Same throwaway database as store.test.ts; the files run one after the other. */
const DATABASE_URL = process.env["FEEDBACK_TEST_DATABASE_URL"];
const INSTALL_ID = "8c1d4f2e-3b5a-4c6d-8e7f-9a0b1c2d3e4f";
const OTHER_INSTALL_ID = "0f1e2d3c-4b5a-4968-8776-a5b4c3d2e1f0";
const RUN_A = "run-a";
const RUN_B = "run-b";
const AT = (minute: number) => new Date(Date.UTC(2026, 10, 20, 8, minute));
const FEEDBACK: NewFeedback = {
  kind: "bug", title: "Broken", message: "Something is broken.", email: null,
  installId: INSTALL_ID, gupVersion: null, platform: null, locale: null,
};

interface Item {
  readonly installId?: string;
  readonly ts: Date | string;
  readonly runId: string;
  readonly data: Record<string, unknown>;
  readonly receivedAt?: Date;
}

describe.skipIf(DATABASE_URL === undefined)("Postgres journal reading", () => {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const reader = new PgInstallReader(pool);
  let hashes = 0;

  async function history(item: Item & { kind: string; status: string | null }) {
    await pool.query(`INSERT INTO install_history_item
        (install_id, item_hash, ts, run_id, kind, status, data, received_at)
      VALUES ($1, decode(md5($2), 'hex'), $3, $4, $5, $6, $7, coalesce($8, now()))`, [
      item.installId ?? INSTALL_ID, String((hashes += 1)), item.ts, item.runId, item.kind,
      item.status, item.data, item.receivedAt ?? null,
    ]);
  }

  async function log(item: Item & { levelRank: number; event: string }) {
    await pool.query(`INSERT INTO install_log_item
        (install_id, item_hash, ts, run_id, level_rank, event, data, received_at)
      VALUES ($1, decode(md5($2), 'hex'), $3, $4, $5, $6, $7, coalesce($8, now()))`, [
      item.installId ?? INSTALL_ID, String((hashes += 1)), item.ts, item.runId, item.levelRank,
      item.event, item.data, item.receivedAt ?? null,
    ]);
  }

  async function search(text: string, maxLevelRank = 4): Promise<string[]> {
    const page = await reader.listLogs({
      installId: INSTALL_ID, maxLevelRank, search: text, page: 1, pageSize: 50,
    });
    return page.items.map((item) => item.event);
  }

  beforeAll(async () => {
    await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await migrate(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE feedback, mail_outbox, install RESTART IDENTITY CASCADE");
    await pool.query("INSERT INTO install (id) VALUES ($1), ($2)", [INSTALL_ID, OTHER_INSTALL_ID]);
  });

  it("lists the whole history newest first, filtered by kind and status, with counts", async () => {
    await history({ ts: AT(1), runId: RUN_A, kind: "scan", status: null, data: { n: 1 } });
    await history({ ts: AT(2), runId: RUN_A, kind: "update", status: "success", data: { n: 2 } });
    await history({ ts: AT(3), runId: RUN_B, kind: "update", status: "failed", data: { n: 3 } });
    await history({ ts: AT(3), runId: RUN_B, kind: "update", status: "failed", data: { n: 4 } });
    await history({
      installId: OTHER_INSTALL_ID, ts: AT(9), runId: RUN_A, kind: "scan", status: null, data: {},
    });
    const all = await reader.listHistory({
      installId: INSTALL_ID, kind: null, status: null, page: 1, pageSize: 50,
    });
    expect(all.total).toBe(4);
    expect(all.items.map((item) => item.data["n"])).toEqual([4, 3, 2, 1]);
    const failed = await reader.listHistory({
      installId: INSTALL_ID, kind: null, status: "failed", page: 2, pageSize: 1,
    });
    expect(failed).toMatchObject({ total: 2, page: 2 });
    expect(failed.items.map((item) => item.data["n"])).toEqual([3]);
    const breakdown = await reader.historyBreakdown(INSTALL_ID);
    expect([...breakdown].sort((a, b) => a.count - b.count || a.kind.localeCompare(b.kind)))
      .toEqual([
        { kind: "scan", status: null, count: 1 },
        { kind: "update", status: "success", count: 1 },
        { kind: "update", status: "failed", count: 2 },
      ]);
  });

  it("searches event, keys and values ignoring case, %, _ and \\ taken literally", async () => {
    await log({ ts: AT(1), runId: RUN_A, levelRank: 0, event: "update.failed",
      data: { exitCode: 1603, path: "C:\\Program Files\\Git", note: "100% done" } });
    await log({ ts: AT(2), runId: RUN_A, levelRank: 2, event: "scan.done",
      data: { message: "snake_case Option" } });
    await log({ ts: AT(3), runId: RUN_A, levelRank: 3, event: "scan.provider",
      data: { message: "see config" } });
    expect(await search("UPDATE.F")).toEqual(["update.failed"]);
    expect(await search("exitcode")).toEqual(["update.failed"]);
    expect(await search("1603")).toEqual(["update.failed"]);
    expect(await search("Files\\Git")).toEqual(["update.failed"]);
    expect(await search("\\")).toEqual(["update.failed"]);
    expect(await search("100%")).toEqual(["update.failed"]);
    expect(await search("%")).toEqual(["update.failed"]);
    // "see config" would match `e_c` if `_` stayed a wildcard.
    expect(await search("e_c")).toEqual(["scan.done"]);
    expect(await search("option", 1)).toEqual([]);
    expect(await search("option", 2)).toEqual(["scan.done"]);
  });

  it("tells a run's span and counts, and merges its records oldest first", async () => {
    await history({ ts: AT(2), runId: RUN_A, kind: "update", status: "failed", data: { n: "h1" } });
    await history({ ts: AT(1), runId: RUN_A, kind: "scan", status: null, data: { n: "h0" } });
    await history({ ts: AT(5), runId: RUN_B, kind: "scan", status: null, data: { n: "other" } });
    await log({ ts: AT(2), runId: RUN_A, levelRank: 0, event: "update.failed", data: { n: "l1" } });
    await log({ ts: AT(3), runId: RUN_A, levelRank: 2, event: "run.end", data: { n: "l2" } });
    const run = await reader.findRun({ installId: INSTALL_ID, runId: RUN_A });
    expect(run).toMatchObject({
      startedAt: AT(1), endedAt: AT(3), historyCount: 2, logCount: 2, errorCount: 1,
      failedUpdateCount: 1,
    });
    const entries = await reader.listRun({
      installId: INSTALL_ID, runId: RUN_A, page: 1, pageSize: 10,
    });
    expect(entries.total).toBe(4);
    expect(entries.items.map((entry) => `${entry.source}:${String(entry.record.data["n"])}`))
      .toEqual(["history:h0", "log:l1", "history:h1", "log:l2"]);
    expect(await reader.findRun({ installId: OTHER_INSTALL_ID, runId: RUN_A })).toBeNull();
    expect(await reader.findRun({ installId: INSTALL_ID, runId: "unknown" })).toBeNull();
  });

  it("tells what the journals cover: oldest, newest, first received, runs", async () => {
    expect(await reader.journalSpan(INSTALL_ID)).toEqual({
      oldestAt: null, newestAt: null, oldestReceivedAt: null, runCount: 0,
    });
    const received = new Date("2026-11-01T00:00:00.000Z");
    await history({ ts: AT(4), runId: RUN_A, kind: "scan", status: null, data: {} });
    await log({ ts: AT(1), runId: RUN_B, levelRank: 2, event: "a.b", data: {}, receivedAt: received });
    await log({ ts: AT(7), runId: RUN_B, levelRank: 2, event: "a.b", data: {} });
    expect(await reader.journalSpan(INSTALL_ID)).toEqual({
      oldestAt: AT(1), newestAt: AT(7), oldestReceivedAt: received, runCount: 2,
    });
  });

  it("streams every record oldest first, across chunks and equal microsecond times", async () => {
    // 2 500 lines over 3 chunks of 1 000; the first 1 200 share one microsecond timestamp.
    await pool.query(`INSERT INTO install_log_item
        (install_id, item_hash, ts, run_id, level_rank, event, data)
      SELECT $1, decode(md5('bulk' || i), 'hex'),
        CASE WHEN i <= 1200 THEN '2026-11-20T08:00:00.123456Z'::timestamptz
          ELSE '2026-11-20T08:00:00.123456Z'::timestamptz + i * interval '1 microsecond' END,
        'bulk', 3, 'bulk.line', jsonb_build_object('i', i)
      FROM generate_series(1, 2500) AS i`, [INSTALL_ID]);
    await history({ ts: AT(2), runId: RUN_A, kind: "scan", status: null, data: { n: 2 } });
    await history({ ts: AT(1), runId: RUN_A, kind: "scan", status: null, data: { n: 1 } });
    const lines: number[] = [];
    for await (const record of reader.streamLogs(INSTALL_ID)) lines.push(Number(record.data["i"]));
    expect(lines).toHaveLength(2500);
    expect(lines).toEqual(Array.from({ length: 2500 }, (_, index) => index + 1));
    const items: unknown[] = [];
    for await (const record of reader.streamHistory(INSTALL_ID)) items.push(record.data["n"]);
    expect(items).toEqual([1, 2]);
  });

  it("counts the outbox, lists unsent mails oldest first and makes them due now", async () => {
    const feedback = new PgFeedbackRepository(pool);
    const monitor = new PgOutboxMonitor(pool);
    for (let i = 0; i < 4; i += 1) await feedback.create({ ...FEEDBACK, title: `F${i}` });
    const now = new Date();
    await pool.query("UPDATE mail_outbox SET sent_at = $1 WHERE feedback_id = 1", [now]);
    await pool.query(`UPDATE mail_outbox SET attempts = 3, last_error = 'timeout',
      next_attempt_at = now() + interval '1 hour' WHERE feedback_id = 2`);
    await pool.query("UPDATE mail_outbox SET attempts = 8 WHERE feedback_id = 3");
    const since = new Date(now.getTime() - 1000);
    expect(await monitor.counts(since)).toEqual({ waiting: 1, failing: 2, sentRecently: 1 });
    expect(await monitor.counts(new Date(now.getTime() + 1000)))
      .toMatchObject({ sentRecently: 0 });
    const unsent = await monitor.listUnsent({ page: 1, pageSize: 50 });
    expect(unsent.total).toBe(3);
    expect(unsent.items.map((mail) => [mail.feedbackTitle, mail.attempts, mail.lastError]))
      .toEqual([["F1", 3, "timeout"], ["F2", 8, null], ["F3", 0, null]]);
    const due = new Date(now.getTime() + 5000);
    expect(await monitor.retryNow({ now: due, maxAttempts: 8 })).toBe(3);
    const after = await monitor.listUnsent({ page: 1, pageSize: 50 });
    expect(after.items.map((mail) => mail.attempts)).toEqual([3, 7, 0]);
    expect(after.items.every((mail) => mail.nextAttemptAt.getTime() === due.getTime())).toBe(true);
  });
});
