import type { UpdateOutcome } from "../types.js";
import type { OutcomeEntry, PlannedUpdate } from "./update-ports.js";

export interface UpdateReport {
  /** Final outcome per attempted package, in plan order. */
  readonly entries: readonly OutcomeEntry[];
  /** Planned, never attempted: the batch was stopped. */
  readonly cancelled: readonly PlannedUpdate[];
  readonly succeeded: readonly UpdateOutcome[];
  readonly skipped: readonly UpdateOutcome[];
  readonly failed: readonly UpdateOutcome[];
}

export function entryOf(item: PlannedUpdate, outcome: UpdateOutcome): OutcomeEntry {
  return { key: item.key, providerId: item.providerId, outcome };
}

export function buildReport(
  entries: readonly OutcomeEntry[],
  cancelled: readonly PlannedUpdate[],
): UpdateReport {
  const outcomes = entries.map((entry) => entry.outcome);
  return {
    entries,
    cancelled,
    succeeded: outcomes.filter((o) => o.success),
    skipped: outcomes.filter((o) => !o.success && o.skipped === true),
    failed: outcomes.filter((o) => !o.success && o.skipped !== true),
  };
}

/** A skip is a decision, not an error: only failures make the run fail. */
export function exitCodeOf(report: UpdateReport): 0 | 1 {
  return report.failed.length === 0 ? 0 : 1;
}
