import { runElevatedBatch } from "../elevation.js";
import { recordUpdate } from "../history/store.js";
import type { UpdateOutcome } from "../types.js";
import { discardPendingInterrupt } from "./finalize-outcome.js";
import type { OutcomeEntry, PlannedUpdate, UpdatePorts } from "./update-ports.js";
import { entryOf } from "./update-report.js";

/** What the packages left out get when the user declines the prompt. */
const DECLINED_ELEVATION_MESSAGE = "Élévation refusée par l'utilisateur";

/**
 * Every package that needs administrator rights, behind one prompt: one UAC
 * window (Windows) or one sudo password (POSIX) for the whole batch, instead
 * of each provider failing or prompting on its own.
 *
 * Declined, the packages end skipped, not failed: the user made a choice.
 * The elevated child stays a pure executor — it never touches the history —
 * so the outcomes it sends back are recorded here, in the invoking user's
 * profile. Per-attempt durations are lost in the round-trip and left out
 * rather than faked from the batch total.
 */
export async function runElevatedStep(
  items: readonly PlannedUpdate[],
  ports: UpdatePorts,
): Promise<OutcomeEntry[]> {
  if (items.length === 0) return [];
  if (!(await ports.decisions.confirmElevation(items.length))) {
    const message = ports.decisions.declinedElevation ?? DECLINED_ELEVATION_MESSAGE;
    const declined = items.map((item) => declinedOutcome(item, message));
    return settle(items, declined, { isElevated: false, ports });
  }
  ports.observer.elevationStarted(items);
  // runElevatedBatch answers one outcome per target, in target order.
  const outcomes = await runElevatedBatch(items.map((item) => item.key));
  // The elevated wait goes through runInherit too; drop any interrupt flag it
  // left so it cannot mislabel a later retried package.
  discardPendingInterrupt();
  return settle(items, outcomes, { isElevated: true, ports });
}

function declinedOutcome(item: PlannedUpdate, message: string): UpdateOutcome {
  return { id: item.packageId, success: false, skipped: true, message };
}

function settle(
  items: readonly PlannedUpdate[],
  outcomes: readonly UpdateOutcome[],
  context: { readonly isElevated: boolean; readonly ports: UpdatePorts },
): OutcomeEntry[] {
  return items.map((item, index) => {
    const outcome = outcomes[index] ?? declinedOutcome(item, DECLINED_ELEVATION_MESSAGE);
    recordUpdate({
      providerId: item.providerId,
      outcome,
      ...(item.pkg && { pkg: item.pkg }),
      ...(context.isElevated && { elevated: true }),
      ...(item.scheduleId !== undefined && { scheduleId: item.scheduleId }),
    });
    context.ports.observer.finished({ item, outcome });
    return entryOf(item, outcome);
  });
}
