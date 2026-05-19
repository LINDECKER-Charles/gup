import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * fnm â€” Fast Node Manager. The binary itself has no self-update; we delegate
 * to whichever PM owns it.
 *
 * NOTE: scope is the fnm BINARY, not the Node versions it manages â€” those are
 * a separate concern (would need a dedicated provider listing `fnm list` and
 * comparing against `fnm ls-remote --lts`).
 *
 * `fnm --version` prints "fnm 1.37.0".
 */
export class FnmProvider implements Provider {
  readonly id = "fnm";
  readonly displayName = "fnm (Node version manager)";
  readonly installHint = "winget install Schniz.fnm";

  async isAvailable(): Promise<boolean> {
    return commandExists("fnm");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("fnm", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/fnm\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("Schniz/fnm");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("fnm");
    return [
      {
        id: "fnm",
        name: "fnm",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "fnm",
      binary: "fnm",
      packageIds: {
        scoop: "fnm",
        choco: "fnm",
        winget: "Schniz.fnm",
      },
      manualMessage:
        "TÃ©lÃ©charger https://github.com/Schniz/fnm/releases et remplacer fnm.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("fnm")];
  }
}
