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
 * kind: K8s IN Docker. `kind version` prints "kind v0.23.0 go1.22.x ...".
 */
export class KindProvider implements Provider {
  readonly id = "kind";
  readonly displayName = "kind";
  readonly installHint = pickInstallHint({
    win32: "winget install Kubernetes.kind",
    fallback: "brew install kind",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("kind");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("kind", ["version"]);
    if (failed) return [];

    const match = stdout.match(/kind\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("kubernetes-sigs/kind");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("kind");
    return [
      {
        id: "kind",
        name: "kind",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "kind",
      binary: "kind",
      packageIds: {
        scoop: "kind",
        choco: "kind",
        winget: "Kubernetes.kind",
        brew: "kind",
      },
      manualMessage:
        "Télécharger https://github.com/kubernetes-sigs/kind/releases et remplacer kind.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("kind")];
  }
}
