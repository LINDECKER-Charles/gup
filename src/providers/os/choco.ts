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
    return chocoOutcome(packageId, res.exitCode);
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
    // `choco upgrade all` aggregates many MSI/installer exits into one final
    // exit code. We can't attribute a per-package reboot here without parsing
    // the live stdout, so apply the same broad mapping: 0/3010/1641 ⇒ success.
    return packages.map((p) => chocoOutcome(p.id, res.exitCode));
  }
}

/**
 * Chocolatey propagates the underlying installer/MSI exit code as its own
 * process exit when the upgrade itself was "valid but conditional". The two
 * cases we see in the wild and want to surface as success — not failure —
 * are reboot advisories from the Windows Installer:
 *
 *   3010 — Success, restart required to finish the upgrade. The package is
 *          installed; the user just needs to reboot for kernel/SxS/etc.
 *          state to take effect. Common with vcredist140, .NET runtimes,
 *          driver-adjacent installs.
 *   1641 — Success, restart was initiated by the installer.
 *
 * All other non-zero exits stay failures so we never silently swallow a real
 * MSI 1603 / Chocolatey 1 / lockfile / hash-mismatch outcome.
 */
export function chocoOutcome(id: string, exitCode: number): UpdateOutcome {
  if (exitCode === 0) return { id, success: true };
  if (exitCode === 3010 || exitCode === 1641) {
    return {
      id,
      success: true,
      message: "Mise à jour effectuée — redémarrage requis pour finaliser.",
    };
  }
  return { id, success: false };
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
