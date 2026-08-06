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
 * Flux CLI (GitOps). Version line: "flux version 2.3.0".
 */
export class FluxProvider implements Provider {
  readonly id = "flux";
  readonly displayName = "Flux CLI";
  // Attention : la formule homebrew-core `flux` est le langage de requête
  // d'InfluxData, pas FluxCD. Le CLI GitOps ne vit que dans fluxcd/tap, d'où
  // le nom pleinement qualifié partout ci-dessous.
  readonly installHint = pickInstallHint({
    win32: "winget install FluxCD.Flux",
    fallback: "brew install fluxcd/tap/flux",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("flux");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("flux", ["--version"]);
    if (failed) return [];

    const match = stdout.match(
      // eslint-disable-next-line security/detect-unsafe-regex -- bounded quantifiers, no nested repetition; safe-regex false positive
      /v?([0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?)/,
    );
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("fluxcd/flux2");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("flux");
    return [
      {
        id: "flux",
        name: "Flux CLI",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "flux",
      binary: "flux",
      packageIds: {
        scoop: "flux",
        choco: "flux",
        winget: "FluxCD.Flux",
        brew: "fluxcd/tap/flux",
      },
      manualMessage:
        "Télécharger https://github.com/fluxcd/flux2/releases et remplacer flux.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("flux")];
  }
}
