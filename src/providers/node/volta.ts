import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Volta — Node toolchain manager. `volta --version` prints "1.1.1".
 * No self-update — delegate to source PM.
 */
export class VoltaProvider implements Provider {
  readonly id = "volta";
  readonly displayName = "Volta";
  readonly installHint = pickInstallHint({
    win32: "winget install Volta.Volta",
    fallback: "brew install volta",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("volta");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("volta", ["--version"]);
    if (failed) return [];

    const match = stdout.trim().match(/^v?([0-9][\w.+-]*)/);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("volta-cli/volta");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("volta");
    return [
      {
        id: "volta",
        name: "Volta",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "volta",
      binary: "volta",
      packageIds: {
        scoop: "volta",
        choco: "volta",
        winget: "Volta.Volta",
        brew: "volta",
      },
      manualMessage:
        "Télécharger https://github.com/volta-cli/volta/releases et remplacer volta.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("volta")];
  }
}
