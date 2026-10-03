import type { OutdatedPackage, Provider, UpdateOutcome } from "../../../src/core/types.js";
import type { HttpRoute, SystemSpec } from "../system/types.js";
import type { ProviderContractCase } from "./types.js";

/**
 * Contract cases of a tool that updates itself: one binary reporting its own
 * version, a registry or release API giving the latest one, and the tool's
 * own upgrade command (`stack upgrade`, `phive selfupdate`, `flutter
 * upgrade`…). Two scenarios cover it:
 *
 * - **behind**: the API answers a newer version, the provider lists one row,
 *   and `update(row.id)` runs the self-update, collapsed in `updateAll`;
 * - **up to date**: the API answers the installed version (as the API
 *   spells it), so nothing is listed.
 *
 * Failure paths (probe fails, unparsable banner, API down or malformed) are
 * the fault sweep's business, not a scenario's.
 *
 * Pure data, no vitest import: the fixture recorder loads the cases.
 */
export interface SelfUpdatingTool {
  readonly create: () => Provider;
  /** The binary and its version probe; each scenario adds its release route. */
  readonly system: SystemSpec;
  /** The API answering a newer version, and the row that answer makes. */
  readonly release: HttpRoute;
  readonly row: OutdatedPackage;
  /** The API answering the installed version. */
  readonly upToDate: HttpRoute;
  /** The installs `update(row.id)` spawns, in order. */
  readonly installs: readonly (readonly string[])[];
  /** The outcome when the last install fails, when it says more than `success: false`. */
  readonly onFailure?: Partial<UpdateOutcome>;
}

/** `system` with `release` added to its routes. */
export function withRelease(system: SystemSpec, release: HttpRoute): SystemSpec {
  return { ...system, http: [...(system.http ?? []), release] };
}

/**
 * A scenario of `tool` where the API answers `release` and nothing may be
 * listed: the installed version, or a valid answer without the expected
 * field (an answer the fault sweep does not produce).
 */
export function nothingListedOn(
  tool: SelfUpdatingTool,
  scenario: string,
  release: HttpRoute,
): ProviderContractCase {
  return {
    scenario,
    create: tool.create,
    system: withRelease(tool.system, release),
    outdated: [],
    updateAll: "collapsed",
  };
}

/** The two scenarios of a self-updating tool. */
export function selfUpdatingToolCases(tool: SelfUpdatingTool): ProviderContractCase[] {
  const { create, row } = tool;
  return [
    {
      create,
      system: withRelease(tool.system, tool.release),
      outdated: [row],
      update: {
        packageId: row.id,
        installs: tool.installs,
        ...(tool.onFailure && { onFailure: tool.onFailure }),
      },
      updateAll: "collapsed",
    },
    nothingListedOn(tool, "up to date", tool.upToDate),
  ];
}
