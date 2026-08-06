import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Lazydocker. Same author/style as lazygit:
 *   Version: 0.23.3
 *   Date: ...
 */
export class LazydockerProvider implements Provider {
  readonly id = "lazydocker";
  readonly displayName = "Lazydocker";
  readonly installHint = pickInstallHint({
    win32: "winget install JesseDuffield.Lazydocker",
    fallback: "brew install lazydocker",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("lazydocker");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("lazydocker", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/Version:\s*v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("jesseduffield/lazydocker");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("lazydocker");
    return [
      {
        id: "lazydocker",
        name: "Lazydocker",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "lazydocker",
      binary: "lazydocker",
      packageIds: {
        scoop: "lazydocker",
        choco: "lazydocker",
        winget: "JesseDuffield.Lazydocker",
        brew: "lazydocker",
      },
      manualMessage:
        "Télécharger https://github.com/jesseduffield/lazydocker/releases et remplacer lazydocker.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("lazydocker")];
  }
}
