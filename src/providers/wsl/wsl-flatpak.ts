import {
  distroHasBinary,
  isWslAvailable,
  listWslDistros,
  runInDistro,
  runInDistroInherit,
} from "../../core/wsl.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Flatpak inside any WSL distro. Both --user and --system installs are
 * covered by the default `flatpak update` (it iterates over every
 * installation in scope). We don't elevate: system flatpaks will prompt
 * for sudo themselves if needed â€” that's better than running the whole
 * pipeline as root and surprising the user's keychain agent.
 */
export class WslFlatpakProvider implements Provider {
  readonly id = "wsl-flatpak";
  readonly displayName = "WSL Â· Flatpak";
  readonly installHint = "https://flatpak.org/setup/";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    if (!(await isWslAvailable())) return false;
    return (await listWslDistros()).length > 0;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const distros = await listWslDistros();
    const out: OutdatedPackage[] = [];
    for (const distro of distros) {
      if (!(await distroHasBinary(distro, "flatpak"))) continue;
      const count = await countUpdates(distro);
      if (count <= 0) continue;
      out.push({
        id: distro,
        name: `${distro} (flatpak)`,
        current: "?",
        latest: `${count} pkg`,
      });
    }
    return out;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInDistroInherit(
      packageId,
      "flatpak update --noninteractive --assumeyes",
    );
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

async function countUpdates(distro: string): Promise<number> {
  const { stdout, failed } = await runInDistro(
    distro,
    "flatpak remote-ls --updates --columns=application 2>/dev/null | awk 'NF{c++}END{print c+0}'",
  );
  if (failed) return 0;
  const n = parseInt(stdout.trim(), 10);
  return Number.isFinite(n) ? n : 0;
}
