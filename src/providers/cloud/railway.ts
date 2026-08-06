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
 * Railway CLI. `railway --version` prints "railwayapp 3.5.0" (older) or
 * "railway 3.5.0" depending on the build.
 *
 * No reliable built-in self-update path; we delegate to the original package
 * manager (scoop, winget) or surface a manual reinstall hint.
 */
export class RailwayProvider implements Provider {
  readonly id = "railway";
  readonly displayName = "Railway CLI";
  readonly installHint = pickInstallHint({
    win32: "scoop install railway",
    fallback: "brew install railway",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("railway");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("railway", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/railway(?:app)?\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("railwayapp/cli");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("railway");
    return [
      {
        id: "railway",
        name: "Railway CLI",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "railway",
      binary: "railway",
      packageIds: {
        scoop: "railway",
        winget: "Railway.Railway",
        brew: "railway",
      },
      manualMessage:
        "Relancer https://railway.app/install.ps1 ou télécharger https://github.com/railwayapp/cli/releases",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("railway")];
  }
}
