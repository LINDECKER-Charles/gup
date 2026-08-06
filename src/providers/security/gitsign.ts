import { commandExists, run } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Sigstore gitsign. `gitsign version` prints:
 *   gitsign version v0.12.0
 *   ...
 */
export class GitsignProvider implements Provider {
  readonly id = "gitsign";
  readonly displayName = "gitsign";
  readonly installHint = pickInstallHint({
    win32: "scoop install gitsign",
    fallback: "brew install gitsign",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("gitsign");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("gitsign", ["version"]);
    if (failed) return [];

    const match =
      stdout.match(/GitVersion:\s*v?([0-9][\w.+-]*)/i) ??
      stdout.match(/version\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("sigstore/gitsign");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("gitsign");
    return [
      {
        id: "gitsign",
        name: "gitsign",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "gitsign",
      binary: "gitsign",
      packageIds: {
        scoop: "gitsign",
        brew: "gitsign",
      },
      manualMessage:
        "Télécharger https://github.com/sigstore/gitsign/releases et remplacer gitsign.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("gitsign")];
  }
}
