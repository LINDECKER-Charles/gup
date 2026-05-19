import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * ORAS (OCI Registry As Storage). `oras version` prints:
 *   Version:        1.2.0
 *   Go version:     go1.22.3
 */
export class OrasProvider implements Provider {
  readonly id = "oras";
  readonly displayName = "ORAS";
  readonly installHint = "winget install oras-project.oras";

  async isAvailable(): Promise<boolean> {
    return commandExists("oras");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("oras", ["version"]);
    if (failed) return [];

    const match = stdout.match(/Version:\s*v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("oras-project/oras");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("oras");
    return [
      {
        id: "oras",
        name: "ORAS",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "oras",
      binary: "oras",
      packageIds: {
        scoop: "oras",
        choco: "oras",
        winget: "oras-project.oras",
      },
      manualMessage:
        "TÃ©lÃ©charger https://github.com/oras-project/oras/releases et remplacer oras.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("oras")];
  }
}
