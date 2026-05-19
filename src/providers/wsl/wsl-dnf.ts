import {
  distroHasBinary,
  isWslAvailable,
  listWslDistros,
  runInDistro,
  runInDistroInherit,
} from "../../core/wsl.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * DNF inside Fedora-family WSL distros (Fedora, RHEL-clones, etc.).
 *
 * `dnf check-update` is the canonical check command. Its exit code is the
 * source of truth: 0 = no updates, 100 = updates available, anything else
 * = real error. We rely on the exit code rather than parsing stdout, which
 * is locale-dependent and littered with header lines.
 */
export class WslDnfProvider implements Provider {
  readonly id = "wsl-dnf";
  readonly displayName = "WSL Â· dnf (Fedora)";
  readonly installHint = "wsl --install -d FedoraLinux-42";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    if (!(await isWslAvailable())) return false;
    return (await listWslDistros()).length > 0;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const distros = await listWslDistros();
    const out: OutdatedPackage[] = [];
    for (const distro of distros) {
      if (!(await distroHasBinary(distro, "dnf"))) continue;
      const count = await countUpgradable(distro);
      if (count <= 0) continue;
      out.push({
        id: distro,
        name: `${distro} (dnf)`,
        current: "?",
        latest: count === -1 ? "refresh" : `${count} pkg`,
      });
    }
    return out;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInDistroInherit(packageId, "dnf -y upgrade", {
      asRoot: true,
    });
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

/**
 * Returns positive count, 0 if nothing to update, -1 if updates exist but
 * the count couldn't be derived from stdout (locale shift).
 */
async function countUpgradable(distro: string): Promise<number> {
  const { stdout, exitCode } = await runInDistro(
    distro,
    "dnf -q check-update 2>/dev/null",
    { asRoot: true },
  );
  if (exitCode === 0) return 0;
  if (exitCode !== 100) return 0;
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("Last metadata") && /\s/.test(l));
  return lines.length || -1;
}
