import { recordUpdate } from "../history/store.js";
import { withOperation } from "../state/run-context.js";
import type { OutdatedPackage, Provider, UpdateOptions, UpdateOutcome } from "../types.js";
import { finalizeOutcome } from "./finalize-outcome.js";
import type { UpdateRequest } from "./update-ports.js";

/**
 * The single place where an update is actually applied: everything that must
 * happen around *every* update — the operation context the logs attribute
 * their lines to, interrupt handling, timing, the history record — happens
 * here once instead of at each call site.
 *
 * The elevated batch is the deliberate exception: it runs in a separate
 * process that stays a pure executor, and the pipeline records the outcomes
 * it gets back (`elevated-step.ts`).
 */

export interface ApplyOptions {
  /** Scan entry behind this update, when the caller has it — supplies from/to versions. */
  readonly pkg?: OutdatedPackage;
  /** Provider-level options (force, uninstall-previous, reinstall). */
  readonly update?: UpdateOptions;
  /** Retry strategy label, set only when this call is a retry pass. */
  readonly retry?: string;
  /** The schedule this attempt belongs to. */
  readonly scheduleId?: string;
}

export async function applyUpdate(
  provider: Provider,
  packageId: string,
  options: ApplyOptions = {},
): Promise<UpdateOutcome> {
  const context = { op: "update", providerId: provider.id, packageId } as const;
  return withOperation(context, async () => {
    const startedAt = Date.now();
    // Call with a single argument when there are no provider options: passing
    // an explicit `undefined` would change the observable call shape for
    // providers (and the tests) that only ever expect the package id.
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
      ...(options.scheduleId !== undefined && { scheduleId: options.scheduleId }),
    });
    return outcome;
  });
}

/** What a request carries into its history record: scan entry and schedule. */
export function applyOptionsOf(request: UpdateRequest): ApplyOptions {
  return {
    ...(request.pkg && { pkg: request.pkg }),
    ...(request.scheduleId !== undefined && { scheduleId: request.scheduleId }),
  };
}
