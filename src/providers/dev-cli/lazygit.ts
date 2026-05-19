import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Lazygit. `lazygit --version` prints:
 *   commit=..., build date=..., build source=..., version=0.42.0, os=..., arch=...
 */
export class LazygitProvider implements Provider {
  readonly id = "lazygit";
  readonly displayName = "Lazygit";
  readonly installHint = "winget install JesseDuffield.lazygit";

  async isAvailable(): Promise<boolean> {
    return commandExists("lazygit");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("lazygit", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/version=v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("jesseduffield/lazygit");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("lazygit");
    return [
      {
        id: "lazygit",
        name: "Lazygit",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "lazygit",
      binary: "lazygit",
      packageIds: {
        scoop: "lazygit",
        choco: "lazygit",
        winget: "JesseDuffield.lazygit",
      },
      manualMessage:
        "TÃ©lÃ©charger https://github.com/jesseduffield/lazygit/releases et remplacer lazygit.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("lazygit")];
  }
}
