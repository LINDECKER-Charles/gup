import type { OutdatedPackage, Provider, UpdateOutcome } from "../../../src/core/types.js";
import type { GoldenRef } from "../fixtures/refs.js";
import type { SystemSpec } from "../system/types.js";

/**
 * A provider contract case: one provider on one simulated machine, as pure
 * data plus a factory. `defineProviderContract` turns each case into the
 * generated tests every provider owes (detection, rows, fail-soft, argv,
 * updateAll shape); hand-written tests are left for what only a human knows.
 */

export type UpdateAllShape =
  /** One install per row, one outcome per row, input order. */
  | "per-package"
  /** One install for all rows, one outcome per row. */
  | "one-batch"
  /** One install, one outcome, whatever the row count (self-updaters). */
  | "collapsed"
  /** No install; every outcome skipped (manual-only providers). */
  | "skipped";

export type InvariantId =
  | "row-shape"
  | "row-current-differs"
  | "row-unique-ids"
  | "outcome-id"
  | "update-no-shell"
  | "updateAll-shape"
  | "slow-flag";

/** A documented exception to one invariant. A waiver nothing needs fails its suite. */
export interface Waiver {
  readonly invariant: InvariantId;
  readonly reason: string;
}

export interface UpdateExpectation {
  readonly packageId: string;
  /** Install spawns (`runInherit`) in order; probes through `run()` are not listed. */
  readonly installs: readonly (readonly string[])[];
  /** Outcome when every install exits 0. Default `{ id: packageId, success: true }`. */
  readonly outcome?: Partial<UpdateOutcome>;
  /** Outcome when the last install exits 1. Default `{ id: packageId, success: false }`. */
  readonly onFailure?: Partial<UpdateOutcome>;
}

export interface ProviderContractCase {
  /** Several scenarios per provider are fine; label = `${id} · ${scenario}`. */
  readonly scenario?: string;
  /** Called after the machine is loaded: install hints depend on the platform. */
  readonly create: () => Provider;
  readonly system: SystemSpec;
  /** Exact rows, or a golden for fixture-backed scenarios. */
  readonly outdated: readonly OutdatedPackage[] | GoldenRef;
  readonly update?: UpdateExpectation;
  readonly updateAll: UpdateAllShape;
  readonly waivers?: readonly Waiver[];
}

export interface ContractSuite {
  readonly domain: string;
  readonly cases: readonly ProviderContractCase[];
}

/** One broken invariant, with enough detail to find the row or call. */
export interface Violation {
  readonly invariant: InvariantId;
  readonly detail: string;
}
