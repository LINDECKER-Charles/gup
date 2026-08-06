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
 * k3d: lightweight K8s clusters via k3s in Docker.
 * `k3d version` prints "k3d version v5.6.3\nk3s version v1.28.x ...".
 */
export class K3dProvider implements Provider {
  readonly id = "k3d";
  readonly displayName = "k3d";
  readonly installHint = pickInstallHint({
    win32: "winget install k3d-io.k3d",
    fallback: "brew install k3d",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("k3d");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("k3d", ["version"]);
    if (failed) return [];

    const match = stdout.match(/k3d\s+version\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("k3d-io/k3d");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("k3d");
    return [
      {
        id: "k3d",
        name: "k3d",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "k3d",
      binary: "k3d",
      packageIds: {
        scoop: "k3d",
        choco: "k3d",
        winget: "k3d-io.k3d",
        brew: "k3d",
      },
      manualMessage:
        "Télécharger https://github.com/k3d-io/k3d/releases et remplacer k3d.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("k3d")];
  }
}
