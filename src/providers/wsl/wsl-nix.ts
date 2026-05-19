import {
  distroHasBinary,
  isWslAvailable,
  listWslDistros,
  runInDistroInherit,
} from "../../core/wsl.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Nix (single-user or daemon) inside any WSL distro.
 *
 * Unlike apt/dnf/brew/flatpak there's no cheap "list outdated" command â€”
 * `nix-channel --update` rebuilds the channel index, and `nix-env -u` then
 * decides what to bump. We surface the distro as a refresh action whenever
 * `nix-env` is detected, mirroring the helm-repo provider.
 */
export class WslNixProvider implements Provider {
  readonly id = "wsl-nix";
  readonly displayName = "WSL Â· Nix";
  readonly installHint = "https://nixos.org/download â€” `sh <(curl -L https://nixos.org/nix/install)`";
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    if (!(await isWslAvailable())) return false;
    return (await listWslDistros()).length > 0;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const distros = await listWslDistros();
    const out: OutdatedPackage[] = [];
    for (const distro of distros) {
      if (!(await hasNix(distro))) continue;
      out.push({
        id: distro,
        name: `${distro} (nix)`,
        current: "?",
        latest: "refresh",
        note: "nix-channel --update && nix-env -u",
      });
    }
    return out;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInDistroInherit(
      packageId,
      `${NIX_PREFIX} && nix-channel --update && nix-env -u '*'`,
    );
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

const NIX_EXTRA_PATHS = [
  "$HOME/.nix-profile/bin/nix-env",
  "/nix/var/nix/profiles/default/bin/nix-env",
];

/**
 * Single-user installs put nix at ~/.nix-profile, multi-user at
 * /nix/var/nix/profiles/default. The official installer ships a
 * nix-daemon.sh wrapper that both paths source â€” load it before the
 * command so PATH/NIX_PATH are populated under non-interactive shells.
 */
const NIX_PREFIX =
  'if [ -f /etc/profile.d/nix.sh ]; then . /etc/profile.d/nix.sh; ' +
  'elif [ -f "$HOME/.nix-profile/etc/profile.d/nix.sh" ]; then . "$HOME/.nix-profile/etc/profile.d/nix.sh"; fi';

async function hasNix(distro: string): Promise<boolean> {
  return distroHasBinary(distro, "nix-env", NIX_EXTRA_PATHS);
}
