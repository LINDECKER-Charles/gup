import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Anchore Syft (SBOM generator). `syft version` prints "Version:    1.4.1".
 */
export class SyftProvider implements Provider {
  readonly id = "syft";
  readonly displayName = "Syft";
  readonly installHint = "https://github.com/anchore/syft#installation";

  async isAvailable(): Promise<boolean> {
    return commandExists("syft");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("syft", ["version"]);
    if (failed) return [];

    const match = stdout.match(/Version:\s*v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("anchore/syft");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("syft");
    return [
      {
        id: "syft",
        name: "Syft",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "syft",
      binary: "syft",
      packageIds: {
        scoop: "syft",
        choco: "syft",
        winget: "Anchore.Syft",
      },
      manualMessage:
        "TÃ©lÃ©charger https://github.com/anchore/syft/releases et remplacer syft.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("syft")];
  }
}
