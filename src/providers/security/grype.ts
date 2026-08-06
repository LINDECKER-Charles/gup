import { commandExists, run } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Anchore Grype (vulnerability scanner). `grype version` prints multiple
 * lines; the version line is "Version:    0.79.6".
 */
export class GrypeProvider implements Provider {
  readonly id = "grype";
  readonly displayName = "Grype";
  readonly installHint = pickInstallHint({
    win32: "https://github.com/anchore/grype#installation",
    fallback: "brew install grype",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("grype");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("grype", ["version"]);
    if (failed) return [];

    const match = stdout.match(/Version:\s*v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("anchore/grype");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("grype");
    return [
      {
        id: "grype",
        name: "Grype",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "grype",
      binary: "grype",
      packageIds: {
        scoop: "grype",
        choco: "grype",
        winget: "Anchore.Grype",
        brew: "grype",
      },
      manualMessage:
        "Télécharger https://github.com/anchore/grype/releases et remplacer grype.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("grype")];
  }
}
