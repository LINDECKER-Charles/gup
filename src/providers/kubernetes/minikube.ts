import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * minikube. `minikube version` outputs:
 *   minikube version: v1.33.1
 *   commit: ...
 */
export class MinikubeProvider implements Provider {
  readonly id = "minikube";
  readonly displayName = "Minikube";
  readonly installHint = "winget install Kubernetes.minikube";

  async isAvailable(): Promise<boolean> {
    return commandExists("minikube");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("minikube", ["version"]);
    if (failed) return [];

    const match = stdout.match(/minikube\s+version:\s*v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("kubernetes/minikube");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("minikube");
    return [
      {
        id: "minikube",
        name: "Minikube",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "minikube",
      binary: "minikube",
      packageIds: {
        scoop: "minikube",
        choco: "minikube",
        winget: "Kubernetes.minikube",
      },
      manualMessage:
        "TÃ©lÃ©charger https://github.com/kubernetes/minikube/releases et remplacer minikube.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("minikube")];
  }
}
