import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Trivy (Aqua Security). `trivy --version` prints "Version: 0.51.1\n...".
 */
export class TrivyProvider implements Provider {
  readonly id = "trivy";
  readonly displayName = "Trivy";
  readonly installHint = "winget install AquaSecurity.Trivy";

  async isAvailable(): Promise<boolean> {
    return commandExists("trivy");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("trivy", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/Version:\s*v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("aquasecurity/trivy");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("trivy");
    return [
      {
        id: "trivy",
        name: "Trivy",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "trivy",
      binary: "trivy",
      packageIds: {
        scoop: "trivy",
        choco: "trivy",
        winget: "AquaSecurity.Trivy",
      },
      manualMessage:
        "TÃ©lÃ©charger https://github.com/aquasecurity/trivy/releases et remplacer trivy.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("trivy")];
  }
}
