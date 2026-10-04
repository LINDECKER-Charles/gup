import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import { writeFileAtomic } from "../../config/atomic-write.js";
import { log } from "../../log/log.js";
import { withFileLock } from "../../state/file-lock.js";
import type {
  RunKind,
  RunStatus,
  SchedulerState,
  ScheduleRunRecord,
  ScheduleRunState,
  TargetResult,
} from "../model/types.js";

/**
 * `state.json`: what each schedule last did (the anchor of its due
 * computation, deferrals, the last run's results) and the heartbeat of the
 * trigger. Machine-local, rewritten atomically inside a short file lock, so
 * a tick and a manual run finishing at the same moment never lose each
 * other's record. A corrupt or foreign file reads as empty — every schedule
 * then counts from its arming date, the cron contract — and is replaced by
 * the next write.
 */

const EMPTY: SchedulerState = { v: 1, schedules: {} };
const DIR_MODE = 0o700;
const RUN_KINDS: readonly RunKind[] = ["on-time", "catch-up", "manual"];
const RUN_STATUSES: readonly RunStatus[] = [
  "success",
  "partial",
  "failed",
  "skipped",
  "up-to-date",
  "missed",
];
const TARGET_STATUSES: readonly TargetResult["status"][] = [
  "updated",
  "no-update",
  "failed",
  "skipped",
];

export class RunStateStore {
  readonly #file: string;

  constructor(file: string) {
    this.#file = file;
  }

  read(): SchedulerState {
    let text: string;
    try {
      text = readFileSync(this.#file, "utf8");
    } catch {
      return EMPTY;
    }
    try {
      return parseState(JSON.parse(text));
    } catch (err) {
      log.warn("scheduler.state-corrupt", { file: this.#file, error: String(err) });
      return EMPTY;
    }
  }

  /** Re-read under the lock, apply `mutate`, write atomically; returns what was stored. */
  update(mutate: (state: SchedulerState) => SchedulerState): SchedulerState {
    mkdirSync(dirname(this.#file), { recursive: true, mode: DIR_MODE });
    return withFileLock(this.#file, () => {
      const next = mutate(this.read());
      writeFileAtomic(this.#file, `${JSON.stringify(next, null, 2)}\n`);
      return next;
    });
  }
}

/** `state` with `id`'s entry replaced by `edit(current entry)`. */
export function withScheduleState(
  state: SchedulerState,
  id: string,
  edit: (current: ScheduleRunState) => ScheduleRunState,
): SchedulerState {
  return { ...state, schedules: { ...state.schedules, [id]: edit(state.schedules[id] ?? {}) } };
}

/** `state` without the entries of schedules that no longer exist. */
export function withoutOrphans(
  state: SchedulerState,
  liveIds: ReadonlySet<string>,
): SchedulerState {
  const kept = Object.entries(state.schedules).filter(([id]) => liveIds.has(id));
  return { ...state, schedules: Object.fromEntries(kept) };
}

function parseState(raw: unknown): SchedulerState {
  if (!isObject(raw) || raw["v"] !== 1 || !isObject(raw["schedules"])) {
    throw new Error("unexpected shape");
  }
  const schedules: Record<string, ScheduleRunState> = {};
  for (const [id, entry] of Object.entries(raw["schedules"])) {
    if (/^[0-9a-f]{8}$/.test(id) && isObject(entry)) schedules[id] = parseRunState(entry);
  }
  const lastTickAt = stringOf(raw["lastTickAt"]);
  return { v: 1, ...(lastTickAt !== undefined && { lastTickAt }), schedules };
}

function parseRunState(raw: Readonly<Record<string, unknown>>): ScheduleRunState {
  const lastAttemptAt = stringOf(raw["lastAttemptAt"]);
  const deferrals = raw["deferrals"];
  const lastRun = parseRecord(raw["lastRun"]);
  return {
    ...(lastAttemptAt !== undefined && { lastAttemptAt }),
    ...(Number.isInteger(deferrals) && (deferrals as number) > 0 && {
      deferrals: deferrals as number,
    }),
    ...(lastRun !== undefined && { lastRun }),
  };
}

function parseRecord(raw: unknown): ScheduleRunRecord | undefined {
  if (!isObject(raw)) return undefined;
  const kind = RUN_KINDS.find((candidate) => candidate === raw["kind"]);
  const status = RUN_STATUSES.find((candidate) => candidate === raw["status"]);
  const startedAt = stringOf(raw["startedAt"]);
  const finishedAt = stringOf(raw["finishedAt"]);
  if (!kind || !status || startedAt === undefined || finishedAt === undefined) return undefined;
  const targets = Array.isArray(raw["targets"]) ? raw["targets"].flatMap(parseResult) : [];
  return { kind, status, startedAt, finishedAt, targets };
}

function parseResult(raw: unknown): TargetResult[] {
  if (!isObject(raw)) return [];
  const target = stringOf(raw["target"]);
  const status = TARGET_STATUSES.find((candidate) => candidate === raw["status"]);
  if (target === undefined || !status) return [];
  const optional = (key: "from" | "to" | "message") => {
    const value = stringOf(raw[key]);
    return value !== undefined ? { [key]: value } : {};
  };
  return [{ target, status, ...optional("from"), ...optional("to"), ...optional("message") }];
}

function isObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOf(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
