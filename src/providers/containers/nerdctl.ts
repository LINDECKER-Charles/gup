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
 * nerdctl (containerd's docker-compat CLI). `nerdctl --version` prints
 * "nerdctl version 1.7.6".
 */
export class NerdctlProvider implements Provider {
  readonly id = "nerdctl";
  readonly displayName = "nerdctl";
  readonly installHint = pickInstallHint({
    win32: "scoop install nerdctl",
    fallback: "brew install nerdctl",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("nerdctl");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("nerdctl", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/version\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("containerd/nerdctl");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("nerdctl");
    return [
      {
        id: "nerdctl",
        name: "nerdctl",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "nerdctl",
      binary: "nerdctl",
      packageIds: {
        scoop: "nerdctl",
        brew: "nerdctl",
      },
      manualMessage:
        "Télécharger https://github.com/containerd/nerdctl/releases et remplacer nerdctl.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("nerdctl")];
  }
}
