import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseTagMatching } from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Kustomize lives in the kubernetes-sigs/kustomize monorepo, which also
 * releases the api/cmd subpackages. Releases for the binary are tagged
 * `kustomize/vX.Y.Z` — we filter on that prefix.
 *
 * `kustomize version` prints just the semver, e.g. "v5.4.3".
 */
export class KustomizeProvider implements Provider {
  readonly id = "kustomize";
  readonly displayName = "Kustomize";
  readonly installHint = pickInstallHint({
    win32: "winget install Kubernetes.kustomize",
    fallback: "brew install kustomize",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("kustomize");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("kustomize", ["version"]);
    if (failed) return [];

    const match = stdout.match(
      // eslint-disable-next-line security/detect-unsafe-regex -- bounded quantifiers, no nested repetition; safe-regex false positive
      /v?([0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?)/,
    );
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseTagMatching(
      "kubernetes-sigs/kustomize",
      (tag) => tag.startsWith("kustomize/"),
      { stripVPrefix: false },
    );
    if (!latest) return [];
    const normLatest = latest.replace(/^kustomize\//, "").replace(/^v/, "");
    if (normLatest === current) return [];

    const source = await detectInstallSource("kustomize");
    return [
      {
        id: "kustomize",
        name: "Kustomize",
        current,
        latest: normLatest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "kustomize",
      binary: "kustomize",
      packageIds: {
        scoop: "kustomize",
        choco: "kustomize",
        winget: "Kubernetes.kustomize",
        brew: "kustomize",
      },
      manualMessage:
        "Télécharger https://github.com/kubernetes-sigs/kustomize/releases et remplacer kustomize.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("kustomize")];
  }
}
