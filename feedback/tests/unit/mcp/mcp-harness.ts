import { randomUUID } from "node:crypto";
import type { AppDeps } from "../../../src/app-deps.js";
import { JOURNAL_VOCABULARY } from "../../../src/domain/journal.js";
import { MCP_PERMISSIONS, type McpPermission } from "../../../src/domain/mcp-access.js";
import type {
  HistoryQuery, InstallReader, InstallSummary, LogQuery, RunEntry, RunKey, RunQuery,
  StoredHistoryRecord, StoredLogRecord,
} from "../../../src/ports/install-reader.js";
import type { Page, PageRequest } from "../../../src/ports/page.js";
import { MCP_TOKEN } from "../../../src/security/mcp-token.js";
import { sha256 } from "../../../src/security/sha256.js";
import { DURATION_MS } from "../../../src/time-units.js";
import { createTestApp, type TestApp } from "../../support/test-app.js";

/** A throwaway token per test run: what the maintainer would hold, never the service. */
export const TOKEN = MCP_TOKEN.create();
export const INSTALL_ID = "0f8b2c1e-6d3a-4b7c-9e21-5a4d3c2b1a09";
export const RUN_ID = "run-2026-11-20-a";
export const OTHER_RUN_ID = "run-2026-11-19-z";

const AT = (minute: number) => new Date(Date.UTC(2026, 10, 20, 8, minute));

const INSTALL: InstallSummary = {
  id: INSTALL_ID, gupVersion: "0.6.0", platform: "win32", arch: "x64", node: "26.10.0",
  locale: "fr", firstSeenAt: AT(0), lastSeenAt: AT(30),
  historyCount: 3, logCount: 4, feedbackCount: 1,
};

const HISTORY: StoredHistoryRecord[] = [
  { id: 1, ts: AT(1), runId: OTHER_RUN_ID, kind: "scan", status: null,
    data: { v: 1, kind: "scan", outdated: 4 } },
  { id: 2, ts: AT(10), runId: RUN_ID, kind: "update", status: "success",
    data: { v: 1, kind: "update", package: "git", status: "success" } },
  { id: 3, ts: AT(12), runId: RUN_ID, kind: "update", status: "failed",
    data: { v: 1, kind: "update", package: "node", status: "failed", error: "EBUSY" } },
];

const LOGS: StoredLogRecord[] = [
  { id: 1, ts: AT(2), runId: OTHER_RUN_ID, levelRank: 2, event: "scan.done",
    data: { level: "info", event: "scan.done" } },
  { id: 2, ts: AT(10), runId: RUN_ID, levelRank: 3, event: "update.start",
    data: { level: "debug", event: "update.start", package: "git" } },
  { id: 3, ts: AT(11), runId: RUN_ID, levelRank: 1, event: "update.retry",
    data: { level: "warn", event: "update.retry", package: "node" } },
  { id: 4, ts: AT(12), runId: RUN_ID, levelRank: 0, event: "update.failed",
    data: { level: "error", event: "update.failed", package: "node", code: "EBUSY" } },
];

function pageOf<T>(items: readonly T[], request: PageRequest): Page<T> {
  const start = (request.page - 1) * request.pageSize;
  return { items: items.slice(start, start + request.pageSize), total: items.length,
    page: request.page, pageSize: request.pageSize };
}

const newestFirst = <T extends { ts: Date }>(items: readonly T[]) =>
  [...items].sort((a, b) => b.ts.getTime() - a.ts.getTime());

function runEntries(key: RunKey): RunEntry[] {
  const entries: RunEntry[] = [
    ...HISTORY.filter((record) => record.runId === key.runId)
      .map((record) => ({ source: "history" as const, record })),
    ...LOGS.filter((record) => record.runId === key.runId)
      .map((record) => ({ source: "log" as const, record })),
  ];
  return entries.sort((a, b) => a.record.ts.getTime() - b.record.ts.getTime());
}

/** One install with two runs, filtered as the port specifies. */
export class FixedInstallReader implements InstallReader {
  readonly historyQueries: HistoryQuery[] = [];
  readonly logQueries: LogQuery[] = [];

  async list(request: PageRequest) { return pageOf([INSTALL], request); }
  async find(installId: string) { return installId === INSTALL_ID ? INSTALL : null; }

  async listHistory(query: HistoryQuery) {
    this.historyQueries.push(query);
    return pageOf(newestFirst(HISTORY.filter((record) =>
      (query.kind === null || record.kind === query.kind)
      && (query.status === null || record.status === query.status))), query);
  }

  async listLogs(query: LogQuery) {
    this.logQueries.push(query);
    const needle = query.search?.toLowerCase() ?? null;
    return pageOf(newestFirst(LOGS.filter((record) => record.levelRank <= query.maxLevelRank
      && (needle === null || JSON.stringify(record.data).toLowerCase().includes(needle)))), query);
  }

  async historyBreakdown() {
    return [
      { kind: "scan" as const, status: null, count: 1 },
      { kind: "update" as const, status: "failed", count: 1 },
      { kind: "update" as const, status: "success", count: 1 },
    ];
  }

  async journalSpan() {
    return { oldestAt: AT(1), newestAt: AT(12), oldestReceivedAt: AT(0), runCount: 2 };
  }

  async findRun(key: RunKey) {
    const entries = runEntries(key);
    const first = entries[0];
    const last = entries.at(-1);
    if (key.installId !== INSTALL_ID || first === undefined || last === undefined) return null;
    return { ...key, startedAt: first.record.ts, endedAt: last.record.ts,
      historyCount: 2, logCount: 3, errorCount: 1, failedUpdateCount: 1 };
  }

  async listRun(query: RunQuery) { return pageOf(runEntries(query), query); }
  async *streamHistory() { yield* HISTORY; }
  async *streamLogs() { yield* LOGS; }
}

export const LEVELS = JOURNAL_VOCABULARY.logLevels;

export interface GrantedAccess {
  readonly token?: string;
  readonly permissions?: readonly McpPermission[];
  readonly lifetimeMs?: number;
}

/** Stores an access as the back office would issue it, without going through a page. */
export async function grantAccess(ctx: TestApp, access: GrantedAccess = {}): Promise<string> {
  const token = access.token ?? MCP_TOKEN.create();
  const createdAt = ctx.clock.now();
  const id = randomUUID();
  await ctx.mcpAccesses.create({
    id, name: `test access ${id.slice(0, 8)}`,
    permissions: access.permissions ?? MCP_PERMISSIONS, tokenHint: MCP_TOKEN.hint(token),
    createdAt, expiresAt: new Date(createdAt.getTime() + (access.lifetimeMs ?? DURATION_MS.day)),
    tokenDigest: sha256(token),
  });
  return id;
}

/** The app with one access holding TOKEN, with every permission unless told otherwise. */
export async function createMcpApp(
  overrides: Partial<AppDeps> = {},
  permissions: readonly McpPermission[] = MCP_PERMISSIONS,
): Promise<TestApp> {
  const ctx = await createTestApp({ journals: new FixedInstallReader(), ...overrides });
  await grantAccess(ctx, { token: TOKEN, permissions });
  return ctx;
}

export interface RpcCall {
  readonly method: string;
  readonly params?: Record<string, unknown>;
  readonly token?: string | null;
  readonly headers?: Record<string, string>;
  readonly ip?: string;
}

/** One JSON-RPC request to /mcp, as Claude Code sends it (2025-era, stateless). */
export function rpc(app: TestApp["app"], call: RpcCall) {
  const token = call.token === undefined ? TOKEN : call.token;
  return app.inject({
    method: "POST",
    url: "/mcp",
    remoteAddress: call.ip ?? "198.51.100.20",
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      ...call.headers,
    },
    payload: { jsonrpc: "2.0", id: 1, method: call.method, params: call.params ?? {} },
  });
}

export interface ToolResult {
  readonly isError?: boolean;
  readonly content: { type: string; text: string }[];
  readonly structuredContent?: Record<string, unknown>;
}

/** Calls a tool and returns its result; fails the test on a protocol error. */
export async function callTool(
  app: TestApp["app"],
  name: string,
  args: Record<string, unknown> = {},
): Promise<ToolResult> {
  const response = await rpc(app, { method: "tools/call", params: { name, arguments: args } });
  const body = response.json() as { result?: ToolResult; error?: unknown };
  if (body.result === undefined) throw new Error(`protocol error: ${response.body}`);
  return body.result;
}

/** The structured result of a successful call. */
export async function callOk(
  app: TestApp["app"],
  name: string,
  args: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const result = await callTool(app, name, args);
  if (result.isError === true || result.structuredContent === undefined) {
    throw new Error(`tool error: ${JSON.stringify(result.content)}`);
  }
  return result.structuredContent;
}
