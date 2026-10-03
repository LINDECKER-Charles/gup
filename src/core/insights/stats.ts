import type { UpdateStatus } from "../history/types.js";

/** Small numeric helpers of the insights, pure. */

/** The median of `values`, or null for none; the mean of the two middle values on an even count. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle] as number;
  return sorted.length % 2 === 1 ? upper : ((sorted[middle - 1] as number) + upper) / 2;
}

/** `part / whole`, or null when `whole` is 0. */
export function ratio(part: number, whole: number): number | null {
  return whole === 0 ? null : part / whole;
}

/** A tally of outcomes, the shape every per-key counter shares. */
export interface OutcomeCounts {
  successes: number;
  failures: number;
  skips: number;
}

export function emptyCounts(): OutcomeCounts {
  return { successes: 0, failures: 0, skips: 0 };
}

const COUNTER_OF: Readonly<Record<UpdateStatus, keyof OutcomeCounts>> = {
  success: "successes",
  failed: "failures",
  skipped: "skips",
};

/** Add one attempt of `status` to `counts`. */
export function countOutcome(counts: OutcomeCounts, status: UpdateStatus): void {
  counts[COUNTER_OF[status]] += 1;
}
