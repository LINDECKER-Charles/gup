import { lookupProvider } from "../platform/lookup-provider.js";
import type { UpdateOptions } from "../types.js";
import { applyOptionsOf, applyUpdate } from "./apply-update.js";
import type {
  OutcomeEntry,
  PlannedUpdate,
  RetryStrategyId,
  UpdatePlan,
  UpdatePorts,
} from "./update-ports.js";
import { groupByProvider } from "./update-plan.js";
import { entryOf } from "./update-report.js";

export interface RetryTier {
  readonly id: RetryStrategyId;
  readonly options: UpdateOptions;
  /** Recorded in the history as the attempt's `retry`. */
  readonly historyLabel: string;
}

/** Least aggressive first. Hash bypass and uninstalls only ever run on an explicit choice. */
export const RETRY_TIERS: readonly RetryTier[] = [
  { id: "force", options: { force: true }, historyLabel: "retry --force" },
  {
    id: "force-uninstall",
    options: { force: true, uninstallPrevious: true },
    historyLabel: "retry --force --uninstall-previous",
  },
  {
    id: "reinstall",
    options: { force: true, reinstall: true },
    historyLabel: "retry uninstall + install",
  },
];

interface RetryContext {
  readonly plan: UpdatePlan;
  readonly ports: UpdatePorts;
}

/**
 * While some failures are flagged `retryable`, ask which tier to replay them
 * with, and replay them. A tier is offered once: after it ran, the next
 * question moves on to the more aggressive ones. The loop ends on "none",
 * when nothing retryable is left, when every tier was used, or when the
 * batch was stopped.
 */
export async function retryLoop(
  entries: readonly OutcomeEntry[],
  context: RetryContext,
): Promise<OutcomeEntry[]> {
  const { ports } = context;
  let current = [...entries];
  let tiers = RETRY_TIERS;
  while (!ports.gate.isAbortRequested()) {
    const failures = retryableItems(current, context.plan);
    if (failures.length === 0 || tiers.length === 0) break;
    const choice = await ports.decisions.chooseRetry({
      failures,
      strategies: tiers.map((tier) => tier.id),
    });
    const tier = tiers.find((candidate) => candidate.id === choice);
    if (!tier) break;
    tiers = tiers.filter((candidate) => candidate !== tier);
    current = await replay(current, { failures, tier, ports });
  }
  return current;
}

function retryableItems(entries: readonly OutcomeEntry[], plan: UpdatePlan): PlannedUpdate[] {
  const planned = new Map([...plan.direct, ...plan.elevated].map((item) => [item.key, item]));
  return entries
    .filter(({ outcome }) => !outcome.success && !outcome.skipped && outcome.retryable === true)
    .flatMap(({ key }) => planned.get(key) ?? []);
}

interface ReplayRequest {
  readonly failures: readonly PlannedUpdate[];
  readonly tier: RetryTier;
  readonly ports: UpdatePorts;
}

/** Replay the failures provider by provider; each new outcome replaces the old one. */
async function replay(entries: OutcomeEntry[], request: ReplayRequest): Promise<OutcomeEntry[]> {
  const replaced = new Map<string, OutcomeEntry>();
  for (const item of groupByProvider(request.failures)) {
    if (request.ports.gate.isAbortRequested()) break;
    const entry = await retryOne(item, request);
    if (entry) replaced.set(item.key, entry);
  }
  return entries.map((entry) => replaced.get(entry.key) ?? entry);
}

async function retryOne(
  item: PlannedUpdate,
  request: ReplayRequest,
): Promise<OutcomeEntry | null> {
  const lookup = lookupProvider(item.providerId);
  if (!lookup.isFound) return null;
  const { tier, ports } = request;
  ports.observer.started({ item, retry: tier.id });
  const startedAt = Date.now();
  const outcome = await applyUpdate(lookup.provider, item.packageId, {
    ...applyOptionsOf(item),
    update: tier.options,
    retry: tier.historyLabel,
  });
  ports.observer.finished({ item, retry: tier.id, outcome, durationMs: Date.now() - startedAt });
  return entryOf(item, outcome);
}
