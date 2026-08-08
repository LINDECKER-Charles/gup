import { recordUpdate } from "../core/history/store.js";
import { finalizeOutcome } from "./skip-controller.js";
import type {
  OutdatedPackage,
  Provider,
  UpdateOptions,
  UpdateOutcome,
} from "../core/types.js";

/**
 * The single place where an update is actually applied.
 *
 * Four call sites used to invoke `provider.update()` directly — the two batch
 * loops (`commands/update.ts`, `commands/menu.ts`), the targeted path and the
 * retry pass — each pairing it with its own `finalizeOutcome()` call. Anything
 * that must happen around *every* update (interrupt handling, timing, and now
 * the history record) had to be repeated four times, which is exactly how one
 * of them ends up forgotten.
 *
 * The elevated batch is the deliberate exception: it runs in a separate
 * process that stays a pure executor, and its parent records the outcomes it
 * gets back (see `commands/update.ts`).
 */

export interface ApplyOptions {
  /** Scan entry behind this update, when the caller has it — supplies from/to versions. */
  pkg?: OutdatedPackage;
  /** Provider-level options (force, uninstall-previous, reinstall). */
  update?: UpdateOptions;
  /** Retry strategy label, set only when this call is a retry pass. */
  retry?: string;
}

/** Minimal view of a skip session — everything these loops need from it. */
export interface AbortGate {
  isAbortRequested(): boolean;
}

export async function applyUpdate(
  provider: Provider,
  packageId: string,
  options: ApplyOptions = {},
): Promise<UpdateOutcome> {
  const startedAt = Date.now();
  // Call with a single argument when there are no provider options: passing an
  // explicit `undefined` would change the observable call shape for providers
  // (and the tests) that only ever expect the package id.
  const raw = options.update
    ? await provider.update(packageId, options.update)
    : await provider.update(packageId);
  const outcome = finalizeOutcome(raw);

  recordUpdate({
    providerId: provider.id,
    outcome,
    durationMs: Date.now() - startedAt,
    ...(options.pkg && { pkg: options.pkg }),
    ...(options.retry !== undefined && { retry: options.retry }),
  });
  return outcome;
}

/**
 * Apply a provider's packages one at a time, stopping as soon as the batch is
 * aborted. One package per call (rather than `provider.updateAll`) is what
 * lets a timeout or a Ctrl+C map to a single package and leave the rest of the
 * batch running.
 */
export async function applyEach(
  provider: Provider,
  packages: readonly OutdatedPackage[],
  session: AbortGate,
): Promise<UpdateOutcome[]> {
  const outcomes: UpdateOutcome[] = [];
  for (const pkg of packages) {
    if (session.isAbortRequested()) break;
    outcomes.push(await applyUpdate(provider, pkg.id, { pkg }));
  }
  return outcomes;
}
