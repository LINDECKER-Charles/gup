import {
  distroHasBinary,
  isWslAvailable,
  listWslDistros,
  runInDistro,
  runInDistroInherit,
} from "../../core/wsl.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Pacman inside Arch-family WSL distros.
 *
 * The `checkupdates` script (from `pacman-contrib`) is the safe way to
 * query upgradable packages without holding the live sync DB lock. If it
 * isn't installed we still surface the distro as a refresh-style action
 * so the user can trigger `pacman -Syu` from the menu.
 */
export class WslPacmanProvider implements Provider {
  readonly id = "wsl-pacman";
  readonly displayName = "WSL Â· pacman (Arch)";
  readonly installHint = "wsl --install -d archlinux";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    if (!(await isWslAvailable())) return false;
    return (await listWslDistros()).length > 0;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const distros = await listWslDistros();
    const out: OutdatedPackage[] = [];
    for (const distro of distros) {
      if (!(await distroHasBinary(distro, "pacman"))) continue;
      const probe = await probeUpgradable(distro);
      if (!probe) continue;
      out.push({
        id: distro,
        name: `${distro} (pacman)`,
        current: "?",
        latest: probe.count > 0 ? `${probe.count} pkg` : "refresh",
        ...(probe.note && { note: probe.note }),
      });
    }
    return out;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInDistroInherit(packageId, "pacman -Syu --noconfirm", {
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

interface PacmanProbe {
  count: number;
  note?: string;
}

async function probeUpgradable(distro: string): Promise<PacmanProbe | null> {
  if (await distroHasBinary(distro, "checkupdates")) {
    const { stdout, exitCode } = await runInDistro(distro, "checkupdates 2>/dev/null");
    if (exitCode === 0) {
      const count = stdout
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0).length;
      return count > 0 ? { count } : null;
    }
    if (exitCode === 2) return null;
    return null;
  }
  return {
    count: 0,
    note: "pacman-contrib absent â€” dÃ©clencher pacman -Syu pour vÃ©rifier",
  };
}
