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
 * dive (image inspector). `dive --version` prints "dive 0.12.0".
 */
export class DiveProvider implements Provider {
  readonly id = "dive";
  readonly displayName = "dive";
  readonly installHint = pickInstallHint({
    win32: "winget install wagoodman.dive",
    fallback: "brew install dive",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("dive");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("dive", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/dive\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("wagoodman/dive");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("dive");
    return [
      {
        id: "dive",
        name: "dive",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "dive",
      binary: "dive",
      packageIds: {
        scoop: "dive",
        choco: "dive",
        winget: "wagoodman.dive",
        brew: "dive",
      },
      manualMessage:
        "Télécharger https://github.com/wagoodman/dive/releases et remplacer dive.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("dive")];
  }
}
