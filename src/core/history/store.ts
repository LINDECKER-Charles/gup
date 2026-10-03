import { appendFileSync, mkdirSync } from "node:fs";
import chalk from "chalk";
import { RUN_ID, runTrigger } from "../state/run-context.js";
import { gupVersion } from "../version.js";
import { historyLocation } from "./paths.js";
import {
  HISTORY_SCHEMA_VERSION,
  type HistoryEnvelope,
  type HistoryEvent,
  type ScanEvent,
  type ScanProviderRecord,
  type UpdateEvent,
  type UpdateStatus,
} from "./types.js";
import type {
  OutdatedPackage,
  ProviderScanResult,
  UpdateOutcome,
} from "../types.js";

/**
 * Writer for the activity history (see {@link HistoryEvent} for the schema).
 *
 * Two properties drive every choice here:
 *
 * - **Never break an update.** A full disk, a read-only profile or a locked
 *   file must cost a dimmed warning, not a failed upgrade. Every write is
 *   wrapped, and the warning is emitted once per process so a long batch does
 *   not turn into a wall of the same message.
 * - **Synchronous writes.** Every command in `cli.ts` ends on
 *   `process.exit(code)`, which does not drain pending async I/O — a
 *   fire-and-forget append would routinely lose the last records of a run. At
 *   these sizes the syscall is noise next to spawning an installer.
 */

/** Set to `0` / `false` / `off` / `no` to turn the history off entirely. */
const ENABLED_ENV = "GUP_HISTORY";
const DISABLED_VALUES = new Set(["0", "false", "off", "no"]);

let warned = false;

export interface ScanRecord {
  results: readonly ProviderScanResult[];
  durationMs: number;
  /** Filters the scan ran under, so a reader can tell a fast scan from a full one. */
  options?: { only?: string[] | undefined; fast?: boolean | undefined };
  /** Wall-clock time of each provider's scan, by provider id, when the caller measured it. */
  providerDurations?: ReadonlyMap<string, number>;
}

export interface UpdateRecord {
  providerId: string;
  outcome: UpdateOutcome;
  /** Scan entry behind the attempt, when there is one — supplies from/to versions. */
  pkg?: OutdatedPackage;
  durationMs?: number;
  /** Retry strategy label when this attempt is a retry pass. */
  retry?: string;
  /** True when the attempt ran inside the elevated batch. */
  elevated?: boolean;
  /** The schedule this attempt belongs to, when it runs one. */
  scheduleId?: string;
}

type AttemptDetails = Pick<
  UpdateEvent,
  "durationMs" | "message" | "retry" | "elevated" | "scheduleId"
>;

/** Append one completed scan of the machine. */
export function recordScan(record: ScanRecord): void {
  const providers = record.results.map((result) =>
    providerRecord(result, record.providerDurations),
  );

  const event: ScanEvent = {
    ...envelope("scan"),
    durationMs: wholeMs(record.durationMs),
    fast: record.options?.fast === true,
    filter: [...(record.options?.only ?? [])],
    providers,
    outdated: providers.reduce((total, p) => total + p.outdated, 0),
  };
  append(event);
}

/** Append one update attempt, whatever its outcome. */
export function recordUpdate(record: UpdateRecord): void {
  const { outcome } = record;
  const event: UpdateEvent = {
    ...envelope("update"),
    providerId: record.providerId,
    packageId: outcome.id,
    status: statusOf(outcome),
    ...versionsOf(record.pkg),
    ...attemptDetails(record),
  };
  append(event);
}

function providerRecord(
  result: ProviderScanResult,
  durations: ReadonlyMap<string, number> | undefined,
): ScanProviderRecord {
  const durationMs = durations?.get(result.providerId);
  return {
    providerId: result.providerId,
    outdated: result.packages.length,
    ...(result.error !== undefined && { error: result.error }),
    ...(durationMs !== undefined && { durationMs: wholeMs(durationMs) }),
  };
}

/** `from` / `to`, when the scan behind the attempt knew them. */
function versionsOf(pkg: OutdatedPackage | undefined): Pick<UpdateEvent, "from" | "to"> {
  return {
    ...(pkg?.current !== undefined && { from: pkg.current }),
    ...(pkg?.latest !== undefined && { to: pkg.latest }),
  };
}

/** The optional facts of one attempt, each written only when known. */
function attemptDetails(record: UpdateRecord): AttemptDetails {
  const { durationMs, outcome, retry, elevated, scheduleId } = record;
  return {
    ...(durationMs !== undefined && { durationMs: wholeMs(durationMs) }),
    ...(outcome.message !== undefined && { message: outcome.message }),
    ...(retry !== undefined && { retry }),
    ...(elevated === true && { elevated: true }),
    ...(scheduleId !== undefined && { scheduleId }),
  };
}

/** Durations are stored as whole, non-negative milliseconds. */
function wholeMs(ms: number): number {
  return Math.max(0, Math.round(ms));
}

/**
 * A skipped attempt is not a failure: the provider deferred on purpose, or the
 * user skipped it. Keeping the three apart is the whole point of logging them.
 */
function statusOf(outcome: UpdateOutcome): UpdateStatus {
  if (outcome.success) return "success";
  return outcome.skipped ? "skipped" : "failed";
}

function envelope<K extends HistoryEvent["kind"]>(
  kind: K,
): HistoryEnvelope & { kind: K } {
  const trigger = runTrigger();
  return {
    v: HISTORY_SCHEMA_VERSION,
    ts: new Date().toISOString(),
    runId: RUN_ID,
    gup: gupVersion(),
    platform: process.platform,
    kind,
    ...(trigger !== undefined && { trigger }),
  };
}

function append(event: HistoryEvent): void {
  if (!isEnabled()) return;
  const location = historyLocation(new Date());
  if (!location) return;
  try {
    mkdirSync(location.dir, { recursive: true });
    // One `appendFileSync` per record, on a file opened in append mode: for
    // payloads this small the write lands whole at the end of the file, so the
    // elevated child and its parent can log side by side without a lock, and a
    // process killed mid-write costs at most its own last line.
    appendFileSync(location.file, `${JSON.stringify(event)}\n`, "utf8");
  } catch (err) {
    warnOnce(err);
  }
}

function isEnabled(): boolean {
  const raw = process.env[ENABLED_ENV];
  return raw === undefined || !DISABLED_VALUES.has(raw.trim().toLowerCase());
}

/**
 * Warn on stderr, never stdout: `gup list --json` pipes stdout into other
 * tools and a warning there would corrupt the payload.
 */
function warnOnce(err: unknown): void {
  if (warned) return;
  warned = true;
  const reason = err instanceof Error ? err.message : String(err);
  process.stderr.write(chalk.dim(`  historique non écrit — ${reason}\n`));
}
