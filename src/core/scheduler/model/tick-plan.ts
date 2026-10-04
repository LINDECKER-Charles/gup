import { localized } from "../../i18n/localized.js";
import type { OutdatedPackage, ProviderScanResult } from "../../types.js";
import { targetKey } from "./schedule-target.js";
import type {
  ProviderFacts,
  Schedule,
  ScheduledTarget,
  ScheduleTarget,
  TargetResult,
  TickPlan,
} from "./types.js";

/**
 * What a run will do with its due targets, decided before anything is
 * installed. Pure. A target is updated only when its provider can update
 * unattended, is installed, scanned cleanly and lists the package as
 * outdated — and then with the scan's row, so the id handed to `update()`
 * is the provider's own, never the stored string.
 *
 * The last line of "never a whole provider": a row that stands for the whole
 * provider (`aggregate`) is skipped even when a hand-edited schedule names
 * it, and so is a row that needs administrator rights, since a scheduled run
 * is never elevated.
 */

export interface TickPlanInput {
  readonly due: readonly Schedule[];
  readonly scans: readonly ProviderScanResult[];
  /** Ids of the needed providers detected on this machine. */
  readonly available: ReadonlySet<string>;
  readonly providers: ProviderFacts;
}

/** Why a due target was skipped, in the interface's languages: stored with the run. */
export const SKIP_REASONS = localized({
  en: {
    notDetected: "provider not detected on this machine",
    aggregate: "target = whole provider, cannot be scheduled",
    requiresAdmin: "administrator rights required — scheduled runs are never elevated",
    scanFailed: (error: string): string => `provider scan failed: ${error}`,
    adminOnly: (name: string): string => `"${name}" asks for sudo/admin on every update`,
  },
  fr: {
    notDetected: "provider non détecté sur cette machine",
    aggregate: "cible = provider entier, non planifiable",
    requiresAdmin:
      "droits administrateur requis — les exécutions planifiées ne sont jamais élevées",
    scanFailed: (error) => `scan du provider en échec : ${error}`,
    adminOnly: (name) => `« ${name} » demande sudo/admin à chaque mise à jour`,
  },
});

type Decision =
  | { readonly kind: "resolved"; readonly result: Omit<TargetResult, "target"> }
  | { readonly kind: "update"; readonly pkg: OutdatedPackage };

/** Distinct provider ids a run must detect and scan for `schedules`: known, unattended-capable. */
export function neededProviders(
  schedules: readonly Schedule[],
  providers: ProviderFacts,
): string[] {
  const ids = new Set(schedules.flatMap((s) => s.targets.map((t) => t.providerId)));
  return [...ids].filter((id) => {
    const fact = providers.lookup(id);
    return fact.isFound && fact.canUpdateUnattended;
  });
}

export function planTick(input: TickPlanInput): TickPlan {
  const scans = new Map(input.scans.map((scan) => [scan.providerId, scan]));
  const resolved = new Map<string, TargetResult>();
  const updates = new Map<string, Mutable<ScheduledTarget>>();
  for (const schedule of input.due) {
    for (const target of schedule.targets) {
      const key = targetKey(target);
      const decision = decide(target, { input, scans });
      if (decision.kind === "resolved") {
        resolved.set(key, { target: key, ...decision.result });
        continue;
      }
      addUpdate(updates, { target, pkg: decision.pkg, scheduleId: schedule.id });
    }
  }
  return {
    updates: [...updates.values()],
    resolved,
    isEnvironmentDown: isEnvironmentDown(input),
  };
}

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

interface DecisionContext {
  readonly input: TickPlanInput;
  readonly scans: ReadonlyMap<string, ProviderScanResult>;
}

function decide(target: ScheduleTarget, context: DecisionContext): Decision {
  const fact = context.input.providers.lookup(target.providerId);
  if (!fact.isFound) return skipped(fact.error);
  if (!fact.canUpdateUnattended) return skipped(SKIP_REASONS.adminOnly(fact.displayName));
  const scan = context.scans.get(target.providerId);
  if (!context.input.available.has(target.providerId) || !scan) {
    return skipped(SKIP_REASONS.notDetected);
  }
  if (scan.error !== undefined) return skipped(SKIP_REASONS.scanFailed(scan.error));
  const pkg = matchPackage(scan.packages, target.packageId);
  if (!pkg) return { kind: "resolved", result: { status: "no-update" } };
  if (pkg.aggregate === true) return skipped(SKIP_REASONS.aggregate);
  if (pkg.requiresAdmin === true) return skipped(SKIP_REASONS.requiresAdmin);
  return { kind: "update", pkg };
}

function skipped(message: string): Decision {
  return { kind: "resolved", result: { status: "skipped", message } };
}

/** The scan row for `packageId`: exact id first, then the same id ignoring case. */
function matchPackage(
  packages: readonly OutdatedPackage[],
  packageId: string,
): OutdatedPackage | undefined {
  const lower = packageId.toLowerCase();
  return (
    packages.find((pkg) => pkg.id === packageId) ??
    packages.find((pkg) => pkg.id.toLowerCase() === lower)
  );
}

interface WantedUpdate {
  readonly target: ScheduleTarget;
  readonly pkg: OutdatedPackage;
  readonly scheduleId: string;
}

/** One update per scan row, whichever schedules and spellings asked for it. */
function addUpdate(updates: Map<string, Mutable<ScheduledTarget>>, wanted: WantedUpdate): void {
  const { target, pkg, scheduleId } = wanted;
  const rowKey = targetKey({ providerId: target.providerId, packageId: pkg.id });
  const existing = updates.get(rowKey) ?? {
    providerId: target.providerId,
    pkg,
    targets: [],
    scheduleIds: [],
  };
  existing.targets = unique([...existing.targets, targetKey(target)]);
  existing.scheduleIds = unique([...existing.scheduleIds, scheduleId]);
  updates.set(rowKey, existing);
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** At least one needed provider is installed, and every installed one failed to scan. */
function isEnvironmentDown(input: TickPlanInput): boolean {
  const needed = neededProviders(input.due, input.providers);
  const scanned = input.scans.filter(
    (scan) => needed.includes(scan.providerId) && input.available.has(scan.providerId),
  );
  return scanned.length > 0 && scanned.every((scan) => scan.error !== undefined);
}
