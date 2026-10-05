import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
  installedByField,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { MANUAL_STEPS } from "../manual-steps.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Tilt. `tilt version` prints "v0.33.21, built ...".
 */
export class TiltProvider implements Provider {
  readonly id = "tilt";
  readonly displayName = "Tilt";
  readonly installHint = pickInstallHint({
    win32: "scoop install tilt",
    fallback: "brew install tilt",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("tilt");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("tilt", ["version"]);
    if (failed) return [];

    const match = stdout.match(/v?([0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?)/);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("tilt-dev/tilt");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("tilt");
    return [
      {
        id: "tilt",
        name: "Tilt",
        current,
        latest,
        note: describeSource(source),
        ...installedByField(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "tilt",
      binary: "tilt",
      packageIds: {
        scoop: "tilt",
        brew: "tilt",
      },
      manualMessage: MANUAL_STEPS.downloadAndReplace(
        "https://github.com/tilt-dev/tilt/releases",
        "tilt.exe",
      ),
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("tilt")];
  }
}
