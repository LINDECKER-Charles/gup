import type { Provider } from "../../../src/core/types.js";
import type { CommandScript, HttpRoute } from "../system/types.js";
import { type Delegation, delegationRoutes, installedVia, upgradeArgv } from "./installers.js";
import type { ProviderContractCase } from "./types.js";

/**
 * Contract cases of the most common provider shape: one binary that reports
 * its own version, a release API that gives the latest one, and an upgrade
 * handed to whichever installer owns the binary. Three scenarios cover it:
 *
 * - **scoop**: the outdated row (`via scoop`), the upgrade, and the same
 *   upgrade routed to every other installer;
 * - **manual install**: a hand-installed binary is flagged `manual` and its
 *   update is skipped with the provider's manual message;
 * - **up to date**: the release API answers the installed version (as the API
 *   spells it, a `v` prefix included), so nothing is listed.
 *
 * Failure paths (probe fails, unparsable banner, API down or malformed) are
 * the fault sweep's business, not a scenario's.
 */
export interface ReleasedTool {
  readonly create: () => Provider;
  /** Row id and display name. */
  readonly id: string;
  readonly name: string;
  readonly binary: string;
  /** The version probe, with what it prints on this machine. */
  readonly probe: CommandScript;
  /** The version the probe output means. */
  readonly current: string;
  /** The release API answering a newer version, and that version as listed. */
  readonly release: HttpRoute;
  readonly latest: string;
  /** The release API answering the installed version. */
  readonly upToDate: HttpRoute;
  readonly delegation: Delegation;
}

function scoopCase(tool: ReleasedTool): ProviderContractCase {
  const { id, name, current, latest } = tool;
  const argv = upgradeArgv("scoop", tool.delegation.ids);
  if (!argv) throw new Error(`${id}: a released tool case needs a scoop id`);
  return {
    scenario: "scoop",
    create: tool.create,
    system: installedVia("scoop", tool.binary, { commands: [tool.probe], http: [tool.release] }),
    outdated: [{ id, name, current, latest, note: "via scoop" }],
    update: { packageId: id, installs: [argv] },
    routes: delegationRoutes(tool.binary, tool.delegation),
    updateAll: "collapsed",
  };
}

function manualCase(tool: ReleasedTool): ProviderContractCase {
  const { id, name, current, latest } = tool;
  return {
    scenario: "manual install",
    create: tool.create,
    system: installedVia("manual", tool.binary, { commands: [tool.probe], http: [tool.release] }),
    outdated: [{ id, name, current, latest, note: "manuel", manual: true }],
    update: {
      packageId: id,
      installs: [],
      outcome: { success: false, skipped: true, message: tool.delegation.manualMessage },
    },
    updateAll: "skipped",
  };
}

/** What a scenario changes on the scoop machine of a released tool. */
export interface ToolMachineChange {
  readonly probe?: CommandScript;
  readonly release?: HttpRoute;
}

/**
 * A scenario of `tool` where nothing may be listed: the scoop machine with
 * the probe or the release API answering otherwise. For answers the fault
 * sweep does not produce (valid output without the expected field…).
 */
export function nothingListedCase(
  tool: ReleasedTool,
  scenario: string,
  change: ToolMachineChange,
): ProviderContractCase {
  const probe = change.probe ?? tool.probe;
  const release = change.release ?? tool.release;
  return {
    scenario,
    create: tool.create,
    system: installedVia("scoop", tool.binary, { commands: [probe], http: [release] }),
    outdated: [],
    updateAll: "collapsed",
  };
}

/** The three scenarios of a released, delegated single-binary tool. */
export function releasedToolCases(tool: ReleasedTool): ProviderContractCase[] {
  const upToDate = nothingListedCase(tool, "up to date", { release: tool.upToDate });
  return [scoopCase(tool), manualCase(tool), upToDate];
}
