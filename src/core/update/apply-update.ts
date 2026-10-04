import { recordUpdate } from "../history/store.js";
import { localized } from "../i18n/localized.js";
import { withOperation } from "../state/run-context.js";
import type { OutdatedPackage, Provider, UpdateOptions, UpdateOutcome } from "../types.js";
import { finalizeOutcome } from "./finalize-outcome.js";
import type { UpdateDecisions, UpdateRequest } from "./update-ports.js";

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

/** The message of an attempt whose `update()` threw, with the reason it threw. */
export const REJECTION_MESSAGES = localized({
  en: {
    /**
     * The runner's argv barrier refused it (`sanitizeCommand` / `sanitizeArgs`
     * in `core/runner.ts`, whose errors start with {@link BARRIER_ERROR_PREFIX}).
     */
    barrierRefusal: (reason: string) => `refused by the safety barrier: ${reason}`,
    /** The provider threw anything else. */
    unexpectedFailure: (reason: string) => `unexpected error: ${reason}`,
  },
  fr: {
    barrierRefusal: (reason) => `refusé par la barrière de sécurité : ${reason}`,
    unexpectedFailure: (reason) => `erreur inattendue : ${reason}`,
  },
});

const BARRIER_ERROR_PREFIX = "runner: ";

export async function applyUpdate(
  provider: Provider,
  packageId: string,
  options: ApplyOptions = {},
): Promise<UpdateOutcome> {
  const context = { op: "update", providerId: provider.id, packageId } as const;
  return withOperation(context, async () => {
    const startedAt = Date.now();
    const raw = await settledUpdate(provider, packageId, options.update);
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

/**
 * The provider's outcome — or, when `update()` rejects, a failed one. A
 * rejection is not an outcome a batch can stop on: the runner's argv barrier
 * refuses an unsafe package id by throwing, and that one package must fail
 * (recorded like any failure) while the rest of the batch goes on.
 */
async function settledUpdate(
  provider: Provider,
  packageId: string,
  update: UpdateOptions | undefined,
): Promise<UpdateOutcome> {
  try {
    // Call with a single argument when there are no provider options: passing
    // an explicit `undefined` would change the observable call shape for
    // providers (and the tests) that only ever expect the package id.
    return update ? await provider.update(packageId, update) : await provider.update(packageId);
  } catch (error) {
    return { id: packageId, success: false, message: rejectionMessage(error) };
  }
}

function rejectionMessage(error: unknown): string {
  const reason = error instanceof Error ? error.message : String(error);
  return reason.startsWith(BARRIER_ERROR_PREFIX)
    ? REJECTION_MESSAGES.barrierRefusal(reason.slice(BARRIER_ERROR_PREFIX.length))
    : REJECTION_MESSAGES.unexpectedFailure(reason);
}

/**
 * What a request carries into its attempt: its scan entry and schedule (for
 * the history record) and, when nobody watches the run, the provider option
 * that forbids prompting.
 */
export function applyOptionsOf(
  request: UpdateRequest,
  decisions: Pick<UpdateDecisions, "unattended">,
): ApplyOptions {
  return {
    ...(request.pkg && { pkg: request.pkg }),
    ...(request.scheduleId !== undefined && { scheduleId: request.scheduleId }),
    ...(decisions.unattended === true && { update: { unattended: true } }),
  };
}
