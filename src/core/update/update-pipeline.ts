import { localized } from "../i18n/localized.js";
import { lookupProvider } from "../platform/lookup-provider.js";
import { getProvider } from "../registry.js";
import { applyOptionsOf, applyUpdate } from "./apply-update.js";
import { runElevatedStep } from "./elevated-step.js";
import { retryLoop } from "./retry-pass.js";
import { batchGuard, updateObservers } from "./update-extensions.js";
import { planUpdates } from "./update-plan.js";
import type {
  OutcomeEntry,
  PlannedUpdate,
  UpdateDecisions,
  UpdateObserver,
  UpdatePlan,
  UpdatePorts,
  UpdateRequest,
} from "./update-ports.js";
import { buildReport, entryOf, type UpdateReport } from "./update-report.js";

/**
 * The one update path, shared by `gup update`, the menu and scheduled runs:
 * plan → direct installs one package at a time → one elevated batch for the
 * admin packages → retry tiers the user picks → report. One package per
 * `provider.update()` call is what lets a timeout or a skip drop a single
 * wedged install while the rest of the batch goes on.
 */

/** `gup update -y`: elevate without asking, never retry with destructive flags. */
export const AUTO_DECISIONS: UpdateDecisions = {
  confirmElevation: async () => true,
  chooseRetry: async () => null,
};

const HEADLESS_LABELS = localized({
  en: { declinedElevation: "Administrator rights required: not available unattended" },
  fr: { declinedElevation: "Droits administrateur requis : non disponible sans surveillance" },
});

/**
 * Scheduled runs: nobody is there to answer a UAC or sudo prompt, nor to
 * consent to a retry. The message is read when a run declines, in the
 * language startup chose.
 */
export const HEADLESS_DECISIONS: UpdateDecisions = {
  confirmElevation: async () => false,
  chooseRetry: async () => null,
  get declinedElevation() {
    return HEADLESS_LABELS.declinedElevation;
  },
};

export async function runUpdates(
  requests: readonly UpdateRequest[],
  ports: UpdatePorts,
): Promise<UpdateReport> {
  const observed: UpdatePorts = { ...ports, observer: withExtraObservers(ports.observer) };
  const plan = planUpdates(requests, displayName);
  observed.observer.planned(plan);
  const release = await enterBatch(observed);
  try {
    return await execute(plan, observed);
  } finally {
    release();
  }
}

async function execute(plan: UpdatePlan, ports: UpdatePorts): Promise<UpdateReport> {
  let entries = await runDirect(plan.direct, ports);
  if (!ports.gate.isAbortRequested()) {
    entries = [...entries, ...(await runElevatedStep(plan.elevated, ports))];
  }
  if (!ports.gate.isAbortRequested()) entries = await retryLoop(entries, { plan, ports });
  const attempted = new Set(entries.map((entry) => entry.key));
  const cancelled = [...plan.direct, ...plan.elevated].filter((item) => !attempted.has(item.key));
  if (cancelled.length > 0) ports.observer.cancelled(cancelled);
  return buildReport(entries, cancelled);
}

async function runDirect(
  items: readonly PlannedUpdate[],
  ports: UpdatePorts,
): Promise<OutcomeEntry[]> {
  const entries: OutcomeEntry[] = [];
  for (const item of items) {
    if (ports.gate.isAbortRequested()) break;
    entries.push(await attemptOne(item, ports));
  }
  return entries;
}

/**
 * One package. A provider that is unknown, or not supported on this platform
 * (a stale scan, a schedule synced from another OS), is skipped with the
 * reason — nothing was attempted, so nothing is recorded.
 */
async function attemptOne(item: PlannedUpdate, ports: UpdatePorts): Promise<OutcomeEntry> {
  const lookup = lookupProvider(item.providerId);
  if (!lookup.isFound) {
    const outcome = { id: item.packageId, success: false, skipped: true, message: lookup.error };
    ports.observer.finished({ item, outcome });
    return entryOf(item, outcome);
  }
  ports.observer.started({ item });
  const startedAt = Date.now();
  const options = applyOptionsOf(item);
  const outcome = await applyUpdate(lookup.provider, item.packageId, options);
  ports.observer.finished({ item, outcome, durationMs: Date.now() - startedAt });
  return entryOf(item, outcome);
}

function displayName(providerId: string): string {
  return getProvider(providerId)?.displayName ?? providerId;
}

/** Interactive runs wait for the batch guard; scheduled ones already hold it. */
function enterBatch(ports: UpdatePorts): Promise<() => void> {
  if (ports.batch === "scheduled") return Promise.resolve(() => {});
  return batchGuard().enter({
    onWait: (holder) => ports.observer.waiting(holder),
    isAborted: () => ports.gate.isAbortRequested(),
  });
}

/** The run's own observer first, then every observer added process-wide, each one fail-soft. */
function withExtraObservers(primary: UpdateObserver): UpdateObserver {
  const extras = updateObservers();
  if (extras.length === 0) return primary;
  const notify = (call: (observer: UpdateObserver) => void): void => {
    call(primary);
    for (const extra of extras) {
      try {
        call(extra);
      } catch {
        // A listening module's bug must not stop the updates it listens to.
      }
    }
  };
  return {
    planned: (plan) => notify((o) => o.planned(plan)),
    started: (attempt) => notify((o) => o.started(attempt)),
    finished: (result) => notify((o) => o.finished(result)),
    elevationStarted: (items) => notify((o) => o.elevationStarted(items)),
    cancelled: (items) => notify((o) => o.cancelled(items)),
    waiting: (holder) => notify((o) => o.waiting(holder)),
  };
}
