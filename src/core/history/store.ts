import { appendFileSync, mkdirSync } from "node:fs";
import { localize } from "../i18n/localized.js";
import { log } from "../log/log.js";
import { redactSecrets } from "../log/redact.js";
import { installConsole } from "../process/output-router.js";
import { isSwitchedOff } from "../state/env-switch.js";
import { explainAccessError } from "../state/foreign-owner.js";
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
 *
 * Provider messages and scan errors are stored as the tools printed them,
 * minus the secrets some of them echo (a token in a URL, a `password=`):
 * known secret shapes are masked at write time. Paths stay verbatim — the
 * history is the user's own record; exports shorten them.
 */

/** Set to `0` / `false` / `off` / `no` to turn the history off entirely. */
const ENABLED_ENV = "GUP_HISTORY";

/**
 * The history names this machine's packages and the paths tools printed:
 * owner-only on POSIX, like the debug log and the reports. A mode only
 * applies to what gets created; Windows keeps the profile's own ACL.
 */
const DIR_MODE = 0o700;
const FILE_MODE = 0o600;

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
    status: updateStatusOf(outcome),
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
    ...(result.error !== undefined && { error: redactSecrets(result.error) }),
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
    ...(outcome.message !== undefined && { message: redactSecrets(outcome.message) }),
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
 * Shared with the debug log, so both records name an outcome the same way.
 */
export function updateStatusOf(outcome: UpdateOutcome): UpdateStatus {
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
  if (!isHistoryEnabled()) return;
  const location = historyLocation(new Date());
  if (!location) return;
  try {
    mkdirSync(location.dir, { recursive: true, mode: DIR_MODE });
    // One `appendFileSync` per record, on a file opened in append mode: for
    // payloads this small the write lands whole at the end of the file, so the
    // elevated child and its parent can log side by side without a lock, and a
    // process killed mid-write costs at most its own last line.
    const line = `${JSON.stringify(event)}\n`;
    appendFileSync(location.file, line, { encoding: "utf8", mode: FILE_MODE });
  } catch (err) {
    // A month gup ran with sudo is root's file: the warning says how to give it back.
    warnOnce(explainAccessError(err, location.file));
  }
}

/** False under `GUP_HISTORY=0` (or `false`, `off`, `no`): nothing is recorded. */
export function isHistoryEnabled(): boolean {
  return !isSwitchedOff(process.env[ENABLED_ENV]);
}

/**
 * Warn on stderr, never stdout: `gup list --json` pipes stdout into other
 * tools and a warning there would corrupt the payload. Through the output
 * router: during an in-app update the warning lands in the install pane, and
 * while a full screen is mounted it waits for the exit instead of painting
 * over the frame. The debug log records it too, with the reason.
 */
function warnOnce(err: unknown): void {
  if (warned) return;
  warned = true;
  const reason = err instanceof Error ? err.message : String(err);
  log.warn("history.write-failed", { reason });
  const notice = localize({ en: "history not written", fr: "historique non écrit" });
  installConsole.warn(`  ${notice} — ${reason}`);
}
