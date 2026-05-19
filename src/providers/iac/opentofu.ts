import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * OpenTofu (Terraform fork). No self-update â€” delegate to the source PM.
 * Version line example: "OpenTofu v1.7.2"
 */
export class OpenTofuProvider implements Provider {
  readonly id = "opentofu";
  readonly displayName = "OpenTofu";
  readonly installHint = "winget install OpenTofu.Tofu";

  async isAvailable(): Promise<boolean> {
    return commandExists("tofu");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("tofu", ["version"]);
    if (failed) return [];

    const match = stdout.match(/OpenTofu\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("opentofu/opentofu");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("tofu");
    return [
      {
        id: "opentofu",
        name: "OpenTofu",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "opentofu",
      binary: "tofu",
      packageIds: {
        scoop: "opentofu",
        choco: "opentofu",
        winget: "OpenTofu.Tofu",
      },
      manualMessage:
        "TÃ©lÃ©charger https://github.com/opentofu/opentofu/releases/latest et remplacer tofu.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("opentofu")];
  }
}
