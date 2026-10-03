import type {
  OutdatedPackage,
  ProviderScanResult,
  UpdateOutcome,
} from "../../src/core/types.js";

/**
 * Data builders for unit tests: the smallest valid value, every field
 * overridable. A test spells out only what it is about.
 */

/** An outdated row, `1.0.0 → 2.0.0` unless overridden. */
export function pkg(id: string, overrides: Partial<OutdatedPackage> = {}): OutdatedPackage {
  return { id, current: "1.0.0", latest: "2.0.0", ...overrides };
}

/** A successful update outcome unless overridden. */
export function outcome(id: string, overrides: Partial<UpdateOutcome> = {}): UpdateOutcome {
  return { id, success: true, ...overrides };
}

/** The scan result of an available provider listing `packages`. */
export function scan(
  providerId: string,
  packages: readonly OutdatedPackage[] = [],
  overrides: Partial<ProviderScanResult> = {},
): ProviderScanResult {
  return { providerId, available: true, packages: [...packages], ...overrides };
}
