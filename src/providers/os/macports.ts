import { flagForElevation } from "../../core/elevation.js";
import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";
import { PLATFORMS } from "../../core/platform/platforms.js";

/**
 * MacPorts — the other macOS ports tree. Smaller user base than Homebrew but
 * they coexist on the same machine, and a MacPorts install is invisible to
 * every other provider here.
 *
 * Every write operation needs root (the whole tree lives under `/opt/local`,
 * owned by root), so updates go through an explicit `sudo`. Rows carry
 * `requiresAdmin` unless gup already runs as root: the CLI then batches them
 * into one `sudo gup __admin-batch` child, where this `sudo` no longer
 * prompts — one password for the whole selection instead of one per port.
 */
export class MacPortsProvider implements Provider {
  readonly id = "macports";
  readonly displayName = "MacPorts";
  readonly installHint = "https://www.macports.org/install.php";
  /** MacPorts targets macOS only. */
  readonly platforms = PLATFORMS.macos;
  /** Every write to the /opt/local tree goes through sudo. */
  readonly canUpdateUnattended = false;

  async isAvailable(): Promise<boolean> {
    return commandExists("port");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("port", ["outdated"]);
    if (failed) return [];
    return flagForElevation(parsePortOutdated(stdout));
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("sudo", ["port", "-N", "upgrade", packageId]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("sudo", ["port", "-N", "upgrade", "outdated"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}

/**
 * `port outdated` prints a header then one port per line:
 *
 *   The following installed ports are outdated:
 *   gettext                        0.21_0 < 0.22_1
 *
 * and `No installed ports are outdated.` when there is nothing to do. Only
 * lines carrying the `<` version comparison are ports, which filters both
 * messages without matching on their (localisable) wording.
 */
export function parsePortOutdated(stdout: string): OutdatedPackage[] {
  const out: OutdatedPackage[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = line.match(/^(\S+)\s+(\S+)\s+<\s+(\S+)/);
    if (!m) continue;
    const [, id, current, latest] = m;
    if (!id || !current || !latest) continue;
    out.push({ id, name: id, current, latest });
  }
  return out;
}
