import {
  distroHasBinary,
  isWslAvailable,
  listWslDistros,
  runInDistro,
  runInDistroInherit,
} from "../../core/wsl.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Linuxbrew inside any WSL distro that has Homebrew installed.
 *
 * Brew lives outside PATH for non-interactive shells on most setups, so we
 * sniff the canonical install paths as well as `command -v`. All commands
 * run as the default user — brew refuses to operate under root.
 */
export class WslBrewProvider implements Provider {
  readonly id = "wsl-brew";
  readonly displayName = "WSL · Homebrew";
  readonly installHint = pickInstallHint({
    win32:
      'https://brew.sh — `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`',
    // Off Windows there is no WSL distro to reach into: Homebrew is installed
    // natively and the `brew` provider already covers it.
    fallback:
      "Provider spécifique à WSL (Windows) — sur macOS/Linux, Homebrew est géré par le provider `brew`.",
  });
  readonly slow = true;

  async isAvailable(): Promise<boolean> {
    if (!(await isWslAvailable())) return false;
    return (await listWslDistros()).length > 0;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const distros = await listWslDistros();
    const out: OutdatedPackage[] = [];
    for (const distro of distros) {
      if (!(await hasBrew(distro))) continue;
      const count = await countOutdated(distro);
      if (count <= 0) continue;
      out.push({
        id: distro,
        name: `${distro} (brew)`,
        current: "?",
        latest: `${count} pkg`,
      });
    }
    return out;
  }

  async update(packageId: string): Promise<UpdateOutcome> {
    const res = await runInDistroInherit(
      packageId,
      `${BREW_PREFIX} && brew update && brew upgrade`,
    );
    return { id: packageId, success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    const outcomes: UpdateOutcome[] = [];
    for (const pkg of packages) outcomes.push(await this.update(pkg.id));
    return outcomes;
  }
}

const BREW_EXTRA_PATHS = [
  "$HOME/.linuxbrew/bin/brew",
  "/home/linuxbrew/.linuxbrew/bin/brew",
];

/**
 * Brew installs ship a `brew shellenv` snippet that prepends the prefix to
 * PATH/MANPATH. Sourcing it before invoking brew makes the call work even
 * when the user's login dotfiles don't load it for non-interactive shells.
 */
const BREW_PREFIX =
  'if [ -x /home/linuxbrew/.linuxbrew/bin/brew ]; then eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"; ' +
  'elif [ -x "$HOME/.linuxbrew/bin/brew" ]; then eval "$($HOME/.linuxbrew/bin/brew shellenv)"; fi';

async function hasBrew(distro: string): Promise<boolean> {
  return distroHasBinary(distro, "brew", BREW_EXTRA_PATHS);
}

async function countOutdated(distro: string): Promise<number> {
  const { stdout, failed } = await runInDistro(
    distro,
    `${BREW_PREFIX} && brew outdated --quiet 2>/dev/null | wc -l`,
  );
  if (failed) return 0;
  const n = parseInt(stdout.trim(), 10);
  return Number.isFinite(n) ? n : 0;
}
