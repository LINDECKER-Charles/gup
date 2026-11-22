import type { JournalItem, JournalQuery } from "../export/shared-journals.js";
import { log } from "../log/log.js";
import type { ClientInfo } from "./client-info.js";
import { callFeedbackService, type FetchLike, type ServiceOutcome } from "./feedback-client.js";
import type { InstallIdentity } from "./install-identity.js";
import { buildLogBatches, MAX_BATCH_ITEMS, type LogBatch } from "./log-batches.js";
import type { StreamMark, UploadCursor, UploadCursorFile } from "./upload-cursor.js";

/**
 * Send what the journals hold since the last acknowledged upload, once the
 * user agreed to share them. Built to sit at the end of a command without
 * anyone noticing: a short timeout per request, a small budget and a batch
 * quota for the whole upload, so the process exit is never held up for long.
 * The decision is read again before every batch: an upload in flight stops
 * as soon as sharing is turned off elsewhere.
 *
 * The cursor advances batch by batch on a 2xx. A batch the service refuses
 * as malformed or too large (400, 413) would be refused forever: it is
 * dropped and the cursor moves past it. Anything else — no answer, 5xx, 429,
 * 401 — leaves the cursor where it is, and a later run sends the batch
 * again. The first upload (an empty cursor) reaches back 30 days at most.
 *
 * It never throws and never prints: it reports through the debug log only
 * (`sharing.upload`, `sharing.upload-dropped`, `sharing.upload-failed`, …).
 */

export interface UploadLimits {
  /** One request may take this long. */
  readonly requestTimeoutMs: number;
  /** The whole upload, reading included, gets this long. */
  readonly budgetMs: number;
  /** How far back the first upload after consent reaches. */
  readonly firstUploadDays: number;
  /** Batches one run sends at most; the rest waits for the next run. */
  readonly maxBatches: number;
}

export const UPLOAD_LIMITS: UploadLimits = Object.freeze({
  requestTimeoutMs: 2_500,
  budgetMs: 4_000,
  firstUploadDays: 30,
  maxBatches: 5,
});

export interface UploaderDeps {
  readonly identity: InstallIdentity;
  readonly cursor: UploadCursorFile;
  /** `POST /api/installs/{id}/logs` on the service (`feedback-urls.ts`). */
  readonly url: string;
  readonly client: ClientInfo;
  /** The journals from the query's instants on (`core/export/shared-journals.ts`). */
  readonly collect: (query: Omit<JournalQuery, "dirs">) => Promise<JournalItem[]>;
  /** The decision as saved now: false stops the upload before its next batch. */
  readonly isGranted: () => boolean;
  readonly fetch?: FetchLike;
  readonly now?: () => number;
  readonly limits?: Partial<UploadLimits>;
}

export type UploadStop = "done" | "budget" | "withdrawn" | "refused" | "error";

export interface UploadSummary {
  /** Batches the service acknowledged. */
  readonly batches: number;
  readonly stop: UploadStop;
}

const DAY_MS = 86_400_000;
/** Below this, a request is not worth starting: it would time out. */
const MIN_REQUEST_MS = 250;
/** Refusals no retry can fix: the batch itself is at fault. */
const DROPPED_STATUSES: ReadonlySet<number> = new Set([400, 413]);

export async function uploadJournals(deps: UploaderDeps): Promise<UploadSummary> {
  try {
    const run = startRun(deps);
    const items = unsent(await deps.collect(queryOf(run)), run.cursor);
    return await sendBatches(buildLogBatches(items, deps.client), run);
  } catch (error) {
    log.warn("sharing.upload-error", { error });
    return { batches: 0, stop: "error" };
  }
}

interface Run {
  readonly deps: UploaderDeps;
  readonly limits: UploadLimits;
  readonly now: () => number;
  readonly deadline: number;
  cursor: UploadCursor;
}

function startRun(deps: UploaderDeps): Run {
  const now = deps.now ?? Date.now;
  const limits = { ...UPLOAD_LIMITS, ...deps.limits };
  return { deps, limits, now, deadline: now() + limits.budgetMs, cursor: deps.cursor.read() };
}

function queryOf({ cursor, limits, now }: Run): Omit<JournalQuery, "dirs"> {
  const floor = new Date(now() - limits.firstUploadDays * DAY_MS);
  const from = (mark: StreamMark | null): Date => (mark === null ? floor : new Date(mark.at));
  return {
    historyFrom: from(cursor.history),
    logsFrom: from(cursor.logs),
    now: new Date(now()),
    limit: limits.maxBatches * MAX_BATCH_ITEMS,
  };
}

/** The records stamped with a stream's cursor instant come first: skip those already sent. */
function unsent(items: readonly JournalItem[], cursor: UploadCursor): JournalItem[] {
  const left = { history: cursor.history?.count ?? 0, logs: cursor.logs?.count ?? 0 };
  return items.filter((item) => {
    const mark = cursor[item.stream];
    if (mark === null || left[item.stream] === 0) return true;
    if (Date.parse(item.ts) !== Date.parse(mark.at)) return true;
    left[item.stream] -= 1;
    return false;
  });
}

async function sendBatches(batches: readonly LogBatch[], run: Run): Promise<UploadSummary> {
  let sent = 0;
  for (const [index, batch] of batches.entries()) {
    const stop = stopBefore(index, run);
    if (stop !== null) {
      log.debug("sharing.upload-deferred", { sent, left: batches.length - index, stop });
      return { batches: sent, stop };
    }
    const outcome = await callFeedbackService(requestOf(batch, run), run.deps.fetch);
    if (outcome.ok) sent += 1;
    else if (!isDropped(outcome)) return refused(outcome, sent);
    passed(batch, run, outcome);
  }
  return { batches: sent, stop: "done" };
}

function stopBefore(index: number, run: Run): UploadStop | null {
  if (index >= run.limits.maxBatches) return "budget";
  if (run.deadline - run.now() < MIN_REQUEST_MS) return "budget";
  return run.deps.isGranted() ? null : "withdrawn";
}

function requestOf(batch: LogBatch, run: Run) {
  const { identity, url } = run.deps;
  return {
    method: "POST" as const,
    url,
    identity,
    body: batch.body,
    timeoutMs: Math.min(run.limits.requestTimeoutMs, run.deadline - run.now()),
    signedAt: run.now(),
  };
}

function isDropped(outcome: ServiceOutcome): boolean {
  return !outcome.ok && outcome.status !== undefined && DROPPED_STATUSES.has(outcome.status);
}

function refused(outcome: ServiceOutcome, sent: number): UploadSummary {
  const status = outcome.status ?? null;
  log.warn("sharing.upload-failed", { status, reason: outcome.ok ? null : outcome.reason });
  return { batches: sent, stop: "refused" };
}

/** Acknowledged or dropped, the batch is behind: the cursor moves past it, on disk at once. */
function passed(batch: LogBatch, run: Run, outcome: ServiceOutcome): void {
  const { cursor } = run;
  run.cursor = {
    history: merged(cursor.history, batch.newest.history),
    logs: merged(cursor.logs, batch.newest.logs),
    lastUploadAt: outcome.ok ? new Date(run.now()).toISOString() : cursor.lastUploadAt,
  };
  run.deps.cursor.save(run.cursor);
  if (outcome.ok) log.debug("sharing.upload", batch.counts);
  else log.warn("sharing.upload-dropped", { status: outcome.status ?? null, ...batch.counts });
}

/** Records sharing the previous mark's instant add to its count. */
function merged(previous: StreamMark | null, newest: StreamMark | undefined): StreamMark | null {
  if (newest === undefined) return previous;
  if (previous === null || Date.parse(previous.at) !== Date.parse(newest.at)) return newest;
  return { at: previous.at, count: previous.count + newest.count };
}
