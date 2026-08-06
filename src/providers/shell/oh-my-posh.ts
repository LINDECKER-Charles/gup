import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Oh My Posh shell prompt. Has a built-in `oh-my-posh upgrade` command for
 * non-PM installs. `oh-my-posh --version` prints the bare version "23.6.0".
 */
export class OhMyPoshProvider implements Provider {
  readonly id = "oh-my-posh";
  readonly displayName = "Oh My Posh";
  readonly installHint = pickInstallHint({
    win32: "winget install JanDeDobbeleer.OhMyPosh",
    fallback: "brew install oh-my-posh",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("oh-my-posh");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("oh-my-posh", ["--version"]);
    if (failed) return [];

    const match = stdout.trim().match(/^v?([0-9][\w.+-]*)/);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("JanDeDobbeleer/oh-my-posh");
    if (!latest || latest === current) return [];

    return [{ id: "oh-my-posh", name: "Oh My Posh", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("oh-my-posh", ["upgrade"]);
    return { id: "oh-my-posh", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("oh-my-posh")];
  }
}
