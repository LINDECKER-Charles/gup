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
 * git-delta. `delta --version` prints "delta 0.17.0".
 */
export class DeltaProvider implements Provider {
  readonly id = "delta";
  readonly displayName = "git-delta";
  // Le binaire s'appelle `delta`, la formule Homebrew `git-delta`.
  readonly installHint = pickInstallHint({
    win32: "winget install dandavison.delta",
    fallback: "brew install git-delta",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("delta");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("delta", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/delta\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("dandavison/delta");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("delta");
    return [
      {
        id: "delta",
        name: "git-delta",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "delta",
      binary: "delta",
      packageIds: {
        scoop: "delta",
        choco: "delta",
        winget: "dandavison.delta",
        brew: "git-delta",
      },
      manualMessage:
        "Télécharger https://github.com/dandavison/delta/releases ou `cargo install git-delta`",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("delta")];
  }
}
