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
 * Terragrunt. `terragrunt --version` prints "terragrunt version v0.58.6".
 */
export class TerragruntProvider implements Provider {
  readonly id = "terragrunt";
  readonly displayName = "Terragrunt";
  readonly installHint = pickInstallHint({
    win32: "winget install Gruntwork.Terragrunt",
    fallback: "brew install terragrunt",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("terragrunt");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("terragrunt", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/terragrunt\s+version\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("gruntwork-io/terragrunt");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("terragrunt");
    return [
      {
        id: "terragrunt",
        name: "Terragrunt",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "terragrunt",
      binary: "terragrunt",
      packageIds: {
        scoop: "terragrunt",
        choco: "terragrunt",
        winget: "Gruntwork.Terragrunt",
        brew: "terragrunt",
      },
      manualMessage:
        "Télécharger https://github.com/gruntwork-io/terragrunt/releases et remplacer terragrunt.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("terragrunt")];
  }
}
