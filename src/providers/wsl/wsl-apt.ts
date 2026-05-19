import {
  distroHasBinary,
  isWslAvailable,
  listWslDistros,
  runInDistro,
  runInDistroInherit,
} from "../../core/wsl.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * APT inside Debian/Ubuntu-family WSL distros. One synthetic entry per
 * distro (id = distro name); we count upgradable packages rather than
 * surfacing each one â€” `apt-get upgrade` is the single atomic action and
 * flooding the table with hundreds of OS packages buries everything else.
 *
 * Runs with `-u root` so unattended upgrades don't trip on sudo prompts in
 * distros that don't ship passwordless sudo for the default user.
 */
export class WslAptProvider implements Provider {
  readonly id = "wsl-apt";
  readonly displayName = "WSL Â· apt (Debian/Ubuntu)";
  readonly installHint = "wsl --install -d Ubuntu";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    if (!(await isWslAvailable())) return false;
    return (await listWslDistros()).length > 0;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const distros = await listWslDistros();
    const out: OutdatedPackage[] = [];
    for (const distro of distros) {
      if (!(await distroHasBinary(distro, "apt-get"))) continue;
      const count = await countUpgradable(distro);
      if (count <= 0) continue;
      out.push({
        id: distro,
        name: `${distro} (apt)`,
        current: "?",
        latest: `${count} pkg`,
      });
    }
    return out;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInDistroInherit(
      packageId,
      "DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get -y upgrade",
      { asRoot: true },
    );
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

async function countUpgradable(distro: string): Promise<number> {
  const script =
    "DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1 && " +
    "apt list --upgradable 2>/dev/null | awk 'NR>1 && /\\//{c++}END{print c+0}'";
  const { stdout, failed } = await runInDistro(distro, script, { asRoot: true });
  if (failed) return 0;
  const n = parseInt(stdout.trim(), 10);
  return Number.isFinite(n) ? n : 0;
}
