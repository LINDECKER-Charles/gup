import { localized } from "../i18n/localized.js";
import type { OutdatedPackage, UpdateOutcome } from "../types.js";
import { updateKeyOf } from "../update/update-plan.js";
import type { UpdateReport } from "../update/update-report.js";
import { targetKey } from "./model/schedule-target.js";
import type {
  RunKind,
  RunStatus,
  Schedule,
  SchedulerState,
  ScheduleRunRecord,
  TargetResult,
  TickPlan,
} from "./model/types.js";

/**
 * A run's results, schedule by schedule. Pure. Each target gets the result
 * of the update it shared with others (one install, however many schedules
 * listed the package), or the decision the plan made without installing.
 */

export interface ScheduleRun {
  readonly schedule: Schedule;
  readonly kind: RunKind;
}

export interface RunOutcome {
  readonly plan: TickPlan;
  /** Null when nothing was handed to the update pipeline. */
  readonly report: UpdateReport | null;
  readonly startedAt: Date;
  readonly finishedAt: Date;
  /** Why a planned update was never attempted (run deadline, stop request). */
  readonly cancelledMessage: string;
}

/** A target no result reached — only if the pipeline dropped one silently. */
const UNSETTLED = localized({ en: { message: "not processed" }, fr: { message: "non traité" } });

export function summarizeRun(
  runs: readonly ScheduleRun[],
  outcome: RunOutcome,
): Map<string, ScheduleRunRecord> {
  const results = targetResults(outcome);
  const records = new Map<string, ScheduleRunRecord>();
  for (const { schedule, kind } of runs) {
    const targets = schedule.targets.map((target): TargetResult => {
      const key = targetKey(target);
      return results.get(key) ?? { target: key, status: "skipped", message: UNSETTLED.message };
    });
    records.set(schedule.id, {
      kind,
      status: runStatusOf(targets),
      startedAt: outcome.startedAt.toISOString(),
      finishedAt: outcome.finishedAt.toISOString(),
      targets,
    });
  }
  return records;
}

/**
 * Nothing outdated → up-to-date; updates and nothing else → success; updates
 * and some failure or skip → partial; no update and a failure → failed;
 * otherwise (only skips) → skipped.
 */
export function runStatusOf(results: readonly TargetResult[]): RunStatus {
  const count = (status: TargetResult["status"]): number =>
    results.filter((result) => result.status === status).length;
  const [updated, failed, skipped] = [count("updated"), count("failed"), count("skipped")];
  if (updated === 0 && failed === 0 && skipped === 0) return "up-to-date";
  if (updated > 0) return failed + skipped === 0 ? "success" : "partial";
  return failed > 0 ? "failed" : "skipped";
}

/** Every target key of the plan with its result. */
function targetResults(outcome: RunOutcome): Map<string, TargetResult> {
  const results = new Map(outcome.plan.resolved);
  const entries = new Map(outcome.report?.entries.map((entry) => [entry.key, entry.outcome]));
  for (const update of outcome.plan.updates) {
    const rowOutcome = entries.get(updateKeyOf(update.providerId, update.pkg.id));
    const result = rowOutcome
      ? resultOf(rowOutcome, update.pkg)
      : { status: "skipped" as const, message: outcome.cancelledMessage };
    for (const key of update.targets) results.set(key, { target: key, ...result });
  }
  return results;
}

function resultOf(outcome: UpdateOutcome, pkg: OutdatedPackage): Omit<TargetResult, "target"> {
  const message = outcome.message !== undefined ? { message: outcome.message } : {};
  if (outcome.success) return { status: "updated", from: pkg.current, to: pkg.latest, ...message };
  return { status: outcome.skipped === true ? "skipped" : "failed", ...message };
}

/** Runs made by the OS trigger that the user has not looked at yet. */
export interface UnseenRuns {
  readonly runs: number;
  /** Those with at least one failed package. */
  readonly failures: number;
}

export interface SeenRunsInput {
  readonly schedules: readonly Schedule[];
  readonly state: SchedulerState;
  /** Runs that finished up to then were seen; null: never. */
  readonly seenUntil: Date | null;
}

/**
 * The schedules' last runs that finished after `seenUntil` — scheduled
 * ones only: a "run now" happened under the user's eyes, and a missed
 * occurrence ran nothing.
 */
export function unseenRuns(input: SeenRunsInput): UnseenRuns {
  const seen = input.seenUntil?.getTime() ?? Number.NEGATIVE_INFINITY;
  const unseen = input.schedules.flatMap((schedule) => {
    const lastRun = input.state.schedules[schedule.id]?.lastRun;
    if (!lastRun || lastRun.kind === "manual" || lastRun.status === "missed") return [];
    return Date.parse(lastRun.finishedAt) > seen ? [lastRun] : [];
  });
  const failures = unseen.filter((run) => run.targets.some((t) => t.status === "failed"));
  return { runs: unseen.length, failures: failures.length };
}
