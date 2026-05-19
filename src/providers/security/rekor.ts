import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Sigstore Rekor CLI. `rekor-cli version` prints:
 *   GitVersion:    v1.3.6
 *   GitCommit:     ...
 */
export class RekorProvider implements Provider {
  readonly id = "rekor";
  readonly displayName = "Rekor CLI";
  readonly installHint = "scoop install rekor-cli";

  async isAvailable(): Promise<boolean> {
    return commandExists("rekor-cli");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("rekor-cli", ["version"]);
    if (failed) return [];

    const match = stdout.match(/GitVersion:\s*v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("sigstore/rekor");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("rekor-cli");
    return [
      {
        id: "rekor",
        name: "Rekor CLI",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "rekor",
      binary: "rekor-cli",
      packageIds: {
        scoop: "rekor-cli",
      },
      manualMessage:
        "TÃ©lÃ©charger https://github.com/sigstore/rekor/releases et remplacer rekor-cli.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("rekor")];
  }
}
