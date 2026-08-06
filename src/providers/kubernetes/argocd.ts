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
 * ArgoCD CLI. `argocd version --client --short` prints "argocd: vX.Y.Z+...".
 */
export class ArgoCdProvider implements Provider {
  readonly id = "argocd";
  readonly displayName = "ArgoCD CLI";
  readonly installHint = pickInstallHint({
    win32: "winget install Argo.ArgoCD",
    fallback: "brew install argocd",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("argocd");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("argocd", ["version", "--client", "--short"]);
    if (failed) return [];

    const match = stdout.match(/argocd:\s*v?([0-9][\w.+-]*?)(?:\+|\s|$)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("argoproj/argo-cd");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("argocd");
    return [
      {
        id: "argocd",
        name: "ArgoCD CLI",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "argocd",
      binary: "argocd",
      packageIds: {
        scoop: "argo-cd",
        choco: "argocd-cli",
        winget: "Argo.ArgoCD",
        brew: "argocd",
      },
      manualMessage:
        "Télécharger https://github.com/argoproj/argo-cd/releases et remplacer argocd.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("argocd")];
  }
}
