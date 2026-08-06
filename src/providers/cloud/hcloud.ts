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
 * Hetzner Cloud CLI. `hcloud version` prints "hcloud 1.45.0".
 */
export class HcloudProvider implements Provider {
  readonly id = "hcloud";
  readonly displayName = "Hetzner Cloud CLI";
  readonly installHint = pickInstallHint({
    win32: "scoop install hcloud",
    fallback: "brew install hcloud",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("hcloud");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("hcloud", ["version"]);
    if (failed) return [];

    const match = stdout.match(/hcloud\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("hetznercloud/cli");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("hcloud");
    return [
      {
        id: "hcloud",
        name: "Hetzner Cloud CLI",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "hcloud",
      binary: "hcloud",
      packageIds: {
        scoop: "hcloud",
        brew: "hcloud",
      },
      manualMessage:
        "Télécharger https://github.com/hetznercloud/cli/releases et remplacer hcloud.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("hcloud")];
  }
}
