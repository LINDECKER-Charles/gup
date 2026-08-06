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
 * Sigstore Cosign. `cosign version` prints:
 *   GitVersion:    v2.2.4
 *   GitCommit: ...
 */
export class CosignProvider implements Provider {
  readonly id = "cosign";
  readonly displayName = "Cosign";
  readonly installHint = pickInstallHint({
    win32: "winget install sigstore.cosign",
    fallback: "brew install cosign",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("cosign");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("cosign", ["version"]);
    if (failed) return [];

    const match = stdout.match(/GitVersion:\s*v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("sigstore/cosign");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("cosign");
    return [
      {
        id: "cosign",
        name: "Cosign",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "cosign",
      binary: "cosign",
      packageIds: {
        scoop: "cosign",
        choco: "cosign",
        winget: "sigstore.cosign",
        brew: "cosign",
      },
      manualMessage:
        "Télécharger https://github.com/sigstore/cosign/releases et remplacer cosign.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("cosign")];
  }
}
