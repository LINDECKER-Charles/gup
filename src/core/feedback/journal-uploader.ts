import type { JournalItem, JournalQuery } from "../export/shared-journals.js";
import { log } from "../log/log.js";
import type { ClientInfo } from "./client-info.js";
import { callFeedbackService, type FetchLike, type ServiceOutcome } from "./feedback-client.js";
import type { InstallIdentity } from "./install-identity.js";
import { buildLogBatches, MAX_BATCH_ITEMS, type LogBatch } from "./log-batches.js";
import { nextSyncAt } from "./sync-cadence.js";
import type { StreamMark, UploadCursor, UploadCursorFile } from "./upload-cursor.js";

/**
 * Send what the journals hold since the last acknowledged upload, once the
 * user agreed to share them — about once a week (`sync-cadence.ts`), or at
 * once when the user opened the feedback form (`isForced`). Built to sit at
 * the end of a command without anyone noticing: a short timeout per request,
 * a small budget and a batch quota for the whole upload, so the process exit
 * is never held up for long; a backlog larger than one run drains over the
 * next runs. The decision is read again before every batch: an upload in
 * flight stops as soon as sharing is turned off elsewhere.
 *
 * A run that ends with nothing left to send completes the sync: its instant
 * is saved (`lastSyncAt`) and the next one waits a week. A run that stops
 * early leaves it where it was, so the next run carries on.
 *
 * The cursor advances batch by batch on a 2xx. A batch the service refuses
 * as malformed or too large (400, 413) would be refused forever: it is
 * dropped and the cursor moves past it. Anything else — no answer, 5xx, 429,
 * 401 — leaves the cursor where it is, and a later run sends the batch
 * again. The first upload (an empty cursor) sends everything the local
 * journals hold, oldest first.
 *
 * It never throws and never prints: it reports through the debug log only
 * (`sharing.upload`, `sharing.upload-dropped`, `sharing.upload-failed`,
 * `sharing.sync-done`, …).
 */

export interface UploadLimits {
  /** One request may take this long. */
  readonly requestTimeoutMs: number;
  /** The whole upload, reading included, gets this long. */
  readonly budgetMs: number;
  /** A completed sync waits this long before the next one. */
  readonly syncIntervalDays: number;
  /** Batches one run sends at most; the rest waits for the next run. */
  readonly maxBatches: number;
}

export const UPLOAD_LIMITS: UploadLimits = Object.freeze({
  requestTimeoutMs: 2_500,
  budgetMs: 4_000,
  syncIntervalDays: 7,
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
  /** Sync now, whatever the weekly cadence says: the user opened the feedback form. */
  readonly isForced?: boolean;
  readonly fetch?: FetchLike;
  readonly now?: () => number;
  readonly limits?: Partial<UploadLimits>;
}

/** `not-due`: the last sync completed less than a week ago; nothing was read. */
export type UploadStop = "done" | "not-due" | "budget" | "withdrawn" | "refused" | "error";

export interface UploadSummary {
  /** Batches the service acknowledged. */
  readonly batches: number;
  readonly stop: UploadStop;
}

/** No record is older: the first upload takes everything. */
const BEGINNING = new Date(0);
/** Below this, a request is not worth starting: it would time out. */
const MIN_REQUEST_MS = 250;
/** Refusals no retry can fix: the batch itself is at fault. */
const DROPPED_STATUSES: ReadonlySet<number> = new Set([400, 413]);

export async function uploadJournals(deps: UploaderDeps): Promise<UploadSummary> {
  try {
    const run = startRun(deps);
    if (deps.isForced !== true && !isDue(run)) return { batches: 0, stop: "not-due" };
    const query = queryOf(run);
    const collected = await deps.collect(query);
    const batches = buildLogBatches(unsent(collected, run.cursor), deps.client);
    const summary = await sendBatches(batches, run);
    return completed(summary, collected.length >= query.limit, run);
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

function isDue({ cursor, limits, now }: Run): boolean {
  return nextSyncAt(cursor, now(), limits.syncIntervalDays) === null;
}

function queryOf({ cursor, limits, now }: Run): Omit<JournalQuery, "dirs"> {
  const from = (mark: StreamMark | null): Date => (mark === null ? BEGINNING : new Date(mark.at));
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

/**
 * Every batch passed: the sync is complete — unless the journals held more
 * than one run reads, in which case the rest waits for the next run.
 */
function completed(summary: UploadSummary, isTruncated: boolean, run: Run): UploadSummary {
  if (summary.stop !== "done") return summary;
  if (isTruncated) {
    log.debug("sharing.upload-deferred", { sent: summary.batches, stop: "budget" });
    return { ...summary, stop: "budget" };
  }
  run.cursor = { ...run.cursor, lastSyncAt: new Date(run.now()).toISOString() };
  run.deps.cursor.save(run.cursor);
  log.debug("sharing.sync-done", { batches: summary.batches });
  return summary;
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
    lastSyncAt: cursor.lastSyncAt,
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
