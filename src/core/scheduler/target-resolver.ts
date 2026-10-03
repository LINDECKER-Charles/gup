import type { ProviderScanResult } from "../types.js";
import type { UpdateRequest } from "../update/update-ports.js";
import { neededProviders, planTick } from "./model/tick-plan.js";
import type { ProviderFacts, Schedule, TickPlan } from "./model/types.js";

/**
 * From schedules to the updates a run will make: detect and scan only the
 * providers their targets name (a tick never pays for a full scan), then
 * plan. Shared by the tick and by "run now" from the CLI and the menu.
 */

export interface TargetScan {
  readonly results: readonly ProviderScanResult[];
  /** Ids of the requested providers detected on this machine. */
  readonly available: ReadonlySet<string>;
}

/** Detect then scan exactly these providers (and record the scan in the history). */
export type TargetScanner = (providerIds: readonly string[]) => Promise<TargetScan>;

export interface TargetResolverDeps {
  readonly scanner: TargetScanner;
  readonly providers: ProviderFacts;
}

const NOTHING_SCANNED: TargetScan = { results: [], available: new Set() };

export class TargetResolver {
  readonly #deps: TargetResolverDeps;

  constructor(deps: TargetResolverDeps) {
    this.#deps = deps;
  }

  async resolve(schedules: readonly Schedule[]): Promise<TickPlan> {
    const ids = neededProviders(schedules, this.#deps.providers);
    const scan = ids.length === 0 ? NOTHING_SCANNED : await this.#deps.scanner(ids);
    return planTick({
      due: schedules,
      scans: scan.results,
      available: scan.available,
      providers: this.#deps.providers,
    });
  }
}

/**
 * The pipeline requests of a plan: the scan's row (its id is what reaches
 * `update()`) and the first schedule that asked for it, for the history.
 */
export function requestsOf(plan: TickPlan): UpdateRequest[] {
  return plan.updates.map((update) => ({
    providerId: update.providerId,
    packageId: update.pkg.id,
    pkg: update.pkg,
    ...(update.scheduleIds[0] !== undefined && { scheduleId: update.scheduleIds[0] }),
  }));
}
