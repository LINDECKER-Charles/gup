import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * MacPorts — the other macOS ports tree. Smaller user base than Homebrew but
 * they coexist on the same machine, and a MacPorts install is invisible to
 * every other provider here.
 *
 * Every write operation needs root (the whole tree lives under `/opt/local`,
 * owned by root), so updates go through an explicit `sudo`. That mirrors the
 * apt/dnf delegation in core/install-source.ts rather than the Windows
 * elevation batch: `isElevated()` reports true on POSIX, so the
 * `requiresAdmin` path would never trigger here.
 */
export class MacPortsProvider implements Provider {
  readonly id = "macports";
  readonly displayName = "MacPorts";
  readonly installHint = pickInstallHint({
    darwin: "https://www.macports.org/install.php",
    fallback: "macOS uniquement — https://www.macports.org/",
  });

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    return commandExists("port");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("port", ["outdated"]);
    if (failed) return [];
    return parsePortOutdated(stdout);
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
