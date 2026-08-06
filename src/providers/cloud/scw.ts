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
 * Scaleway CLI. `scw version` prints a multi-line table whose first row is:
 *   Version          v2.30.0
 *
 * `scw --version` (older) prints "scw version 2.30.0".
 */
export class ScwProvider implements Provider {
  readonly id = "scw";
  readonly displayName = "Scaleway CLI";
  readonly installHint = pickInstallHint({
    win32: "scoop install scw",
    fallback: "brew install scw",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("scw");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("scw", ["version"]);
    if (failed) return [];

    const match =
      stdout.match(/^\s*Version\s+v?([0-9][\w.+-]*)/im) ??
      stdout.match(/scw\s+version\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("scaleway/scaleway-cli");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("scw");
    return [
      {
        id: "scw",
        name: "Scaleway CLI",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "scw",
      binary: "scw",
      packageIds: {
        scoop: "scw",
        brew: "scw",
      },
      manualMessage:
        "Télécharger https://github.com/scaleway/scaleway-cli/releases et remplacer scw.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("scw")];
  }
}
