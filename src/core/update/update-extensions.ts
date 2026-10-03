import type { UpdateObserver } from "./update-ports.js";

/**
 * Process-wide slots of the update pipeline, filled by CLI modules at startup
 * (never by library code): the batch guard that keeps two gup runs from
 * updating at once, and extra observers (the debug log) that hear every
 * pipeline run whoever drives it. Tests reset them with `set…(null)` / the
 * returned unsubscribe.
 */

/** Who holds the update batch, for a "waiting for…" message. */
export interface BatchHolder {
  readonly kind: "interactive" | "scheduled";
  readonly pid: number;
  /** ISO 8601. */
  readonly startedAt: string;
}

export interface BatchWait {
  /** Called once when the batch is held by someone else and this run starts waiting. */
  readonly onWait: (holder: BatchHolder) => void;
  /** Polled while waiting: true gives up the wait. */
  readonly isAborted: () => boolean;
}

export interface BatchGuard {
  /**
   * Resolves with the release once this run may update — or as soon as
   * `isAborted()` turns true, with a no-op release (the caller's gate then
   * cancels every package).
   */
  enter(wait: BatchWait): Promise<() => void>;
}

const NO_GUARD: BatchGuard = { enter: async () => () => {} };

let guard: BatchGuard = NO_GUARD;
const observers = new Set<UpdateObserver>();

/** Install the guard every interactive pipeline run enters; null: none. */
export function setBatchGuard(next: BatchGuard | null): void {
  guard = next ?? NO_GUARD;
}

/** The guard in effect (a pass-through one when none is installed). */
export function batchGuard(): BatchGuard {
  return guard;
}

/** Hear every pipeline run, after its own observer. Returns the unsubscribe. */
export function observeUpdates(observer: UpdateObserver): () => void {
  observers.add(observer);
  return () => observers.delete(observer);
}

/** The observers added through {@link observeUpdates}, in subscription order. */
export function updateObservers(): readonly UpdateObserver[] {
  return [...observers];
}
