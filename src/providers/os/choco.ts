import { commandExists, isElevated, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

const NOT_ADMIN_MESSAGE =
  "Chocolatey nÃ©cessite un terminal admin. Relancer gup depuis PowerShell ou Terminal lancÃ© en Â« ExÃ©cuter en tant qu'administrateur Â».";

/**
 * `choco outdated -r --limit-output` emits: name|currentVersion|availableVersion|pinned
 */
export class ChocoProvider implements Provider {
  readonly id = "choco";
  readonly displayName = "Chocolatey";
  readonly installHint = "https://chocolatey.org/install";

  async isAvailable(): Promise<boolean> {
    return commandExists("choco");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout } = await run("choco", ["outdated", "-r", "--limit-output"]);
    return parseChocoOutdated(stdout);
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    if (!(await isElevated())) {
      return { id: packageId, success: false, skipped: true, message: NOT_ADMIN_MESSAGE };
    }
    const res = await runInherit("choco", ["upgrade", packageId, "-y"]);
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    if (!(await isElevated())) {
      return packages.map((p) => ({
        id: p.id,
        success: false,
        skipped: true,
        message: NOT_ADMIN_MESSAGE,
      }));
    }
    const res = await runInherit("choco", ["upgrade", "all", "-y"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}

export function parseChocoOutdated(stdout: string): OutdatedPackage[] {
  const out: OutdatedPackage[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("Chocolatey")) continue;
    const parts = trimmed.split("|");
    if (parts.length < 3) continue;
    const [name, current, latest, pinned] = parts;
    if (!name || !current || !latest || current === latest) continue;
    out.push({
      id: name,
      name,
      current,
      latest,
      ...(pinned?.toLowerCase() === "true" && { note: "pinned" }),
    });
  }
  return out;
}
