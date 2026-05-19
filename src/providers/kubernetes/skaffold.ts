import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Skaffold. `skaffold version` prints just the semver, e.g. "v2.13.2".
 */
export class SkaffoldProvider implements Provider {
  readonly id = "skaffold";
  readonly displayName = "Skaffold";
  readonly installHint = "winget install Google.Skaffold";

  async isAvailable(): Promise<boolean> {
    return commandExists("skaffold");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("skaffold", ["version"]);
    if (failed) return [];

    const match = stdout.match(/v?([0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?)/);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("GoogleContainerTools/skaffold");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("skaffold");
    return [
      {
        id: "skaffold",
        name: "Skaffold",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "skaffold",
      binary: "skaffold",
      packageIds: {
        scoop: "skaffold",
        choco: "skaffold",
        winget: "Google.Skaffold",
      },
      manualMessage:
        "TÃ©lÃ©charger https://github.com/GoogleContainerTools/skaffold/releases et remplacer skaffold.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("skaffold")];
  }
}
