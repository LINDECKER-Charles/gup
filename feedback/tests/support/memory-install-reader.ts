import type {
  HistoryBreakdownCell, HistoryQuery, InstallReader, InstallSummary, JournalSpan, LogQuery,
  RunEntry, RunKey, RunQuery, RunSummary, StoredHistoryRecord, StoredLogRecord,
} from "../../src/ports/install-reader.js";
import type { Page, PageRequest } from "../../src/ports/page.js";
import { pageOf } from "./page-of.js";

type Owned<T> = T & { readonly installId: string; readonly receivedAt?: Date };

const ERROR_RANK = 0;

function newestFirst<T extends { ts: Date; id: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => b.ts.getTime() - a.ts.getTime() || b.id - a.id);
}

function oldestFirst<T extends { ts: Date; id: number }>(items: readonly T[]): T[] {
  return newestFirst(items).reverse();
}

/** Every scalar of a JSON value, keys included, as text. */
function scalars(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(scalars);
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).flatMap(([key, inner]) => [key, ...scalars(inner)]);
  }
  return value === null ? [] : [String(value)];
}

/** What the Postgres search matches: event name, record text, any key or value. */
function matches(record: StoredLogRecord, search: string): boolean {
  const needle = search.toLowerCase();
  return [record.event, JSON.stringify(record.data), ...scalars(record.data)]
    .some((text) => text.toLowerCase().includes(needle));
}

/** The reader port over arrays the test fills, with the Postgres adapter's semantics. */
export class MemoryInstallReader implements InstallReader {
  readonly installs: InstallSummary[] = [];
  readonly history: Owned<StoredHistoryRecord>[] = [];
  readonly logs: Owned<StoredLogRecord>[] = [];

  async list(request: PageRequest): Promise<Page<InstallSummary>> {
    const sorted = [...this.installs]
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
    return pageOf(sorted, request);
  }

  async find(installId: string): Promise<InstallSummary | null> {
    return this.installs.find((install) => install.id === installId) ?? null;
  }

  async listHistory(query: HistoryQuery): Promise<Page<StoredHistoryRecord>> {
    const found = this.#historyOf(query.installId)
      .filter((record) => query.kind === null || record.kind === query.kind)
      .filter((record) => query.status === null || record.status === query.status);
    return pageOf(newestFirst(found), query);
  }

  async listLogs(query: LogQuery): Promise<Page<StoredLogRecord>> {
    const search = query.search ?? null;
    const found = this.#logsOf(query.installId)
      .filter((record) => record.levelRank <= query.maxLevelRank)
      .filter((record) => search === null || matches(record, search));
    return pageOf(newestFirst(found), query);
  }

  async historyBreakdown(installId: string): Promise<readonly HistoryBreakdownCell[]> {
    const cells = new Map<string, HistoryBreakdownCell>();
    for (const record of this.#historyOf(installId)) {
      const key = `${record.kind}/${record.status}`;
      const count = (cells.get(key)?.count ?? 0) + 1;
      cells.set(key, { kind: record.kind, status: record.status, count });
    }
    return [...cells.values()];
  }

  async journalSpan(installId: string): Promise<JournalSpan> {
    const all = [...this.#historyOf(installId), ...this.#logsOf(installId)];
    const times = all.map((record) => record.ts.getTime());
    const received = all.map((record) => (record.receivedAt ?? record.ts).getTime());
    const dateOf = (values: number[], pick: (...v: number[]) => number) =>
      values.length === 0 ? null : new Date(pick(...values));
    return {
      oldestAt: dateOf(times, Math.min),
      newestAt: dateOf(times, Math.max),
      oldestReceivedAt: dateOf(received, Math.min),
      runCount: new Set(all.map((record) => record.runId)).size,
    };
  }

  async findRun(key: RunKey): Promise<RunSummary | null> {
    const entries = this.#runEntries(key);
    const first = entries[0];
    const last = entries.at(-1);
    if (first === undefined || last === undefined) return null;
    const history = entries.flatMap((entry) => entry.source === "history" ? [entry.record] : []);
    const logs = entries.flatMap((entry) => entry.source === "log" ? [entry.record] : []);
    return {
      ...key,
      startedAt: first.record.ts,
      endedAt: last.record.ts,
      historyCount: history.length,
      logCount: logs.length,
      errorCount: logs.filter((record) => record.levelRank === ERROR_RANK).length,
      failedUpdateCount: history.filter((record) => record.status === "failed").length,
    };
  }

  async listRun(query: RunQuery): Promise<Page<RunEntry>> {
    return pageOf(this.#runEntries(query), query);
  }

  async *streamHistory(installId: string): AsyncIterable<StoredHistoryRecord> {
    yield* oldestFirst(this.#historyOf(installId));
  }

  async *streamLogs(installId: string): AsyncIterable<StoredLogRecord> {
    yield* oldestFirst(this.#logsOf(installId));
  }

  /** Oldest first; at equal times, log lines before history items, then by id. */
  #runEntries(key: RunKey): RunEntry[] {
    const sameRun = (record: Owned<StoredHistoryRecord | StoredLogRecord>) =>
      record.installId === key.installId && record.runId === key.runId;
    const entries: RunEntry[] = [
      ...this.history.filter(sameRun).map((record) => ({ source: "history" as const, record })),
      ...this.logs.filter(sameRun).map((record) => ({ source: "log" as const, record })),
    ];
    const rank = (entry: RunEntry) => (entry.source === "log" ? 0 : 1);
    return entries.sort((a, b) => a.record.ts.getTime() - b.record.ts.getTime()
      || rank(a) - rank(b) || a.record.id - b.record.id);
  }

  #historyOf(installId: string): Owned<StoredHistoryRecord>[] {
    return this.history.filter((record) => record.installId === installId);
  }

  #logsOf(installId: string): Owned<StoredLogRecord>[] {
    return this.logs.filter((record) => record.installId === installId);
  }
}
