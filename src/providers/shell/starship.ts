import { commandExists, run } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import { MANUAL_STEPS } from "../manual-steps.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Starship cross-shell prompt. `starship --version` prints "starship 1.21.1".
 * No self-update — delegated to the package manager that installed it (scoop
 * / choco / winget / cargo). A binary dropped by hand is reported `manual:true`.
 */
export class StarshipProvider implements Provider {
  readonly id = "starship";
  readonly displayName = "Starship";
  readonly installHint = pickInstallHint({
    win32: "winget install Starship.Starship",
    fallback: "brew install starship",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("starship");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("starship", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/starship\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("starship/starship");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("starship");
    return [
      {
        id: "starship",
        name: "Starship",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "starship",
      binary: "starship",
      packageIds: {
        scoop: "starship",
        choco: "starship",
        winget: "Starship.Starship",
        brew: "starship",
      },
      manualMessage: MANUAL_STEPS.downloadOr(
        "https://github.com/starship/starship/releases",
        "cargo install starship --locked",
      ),
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("starship")];
  }
}
