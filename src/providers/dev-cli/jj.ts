import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Jujutsu (jj). `jj --version` prints "jj 0.18.0".
 */
export class JujutsuProvider implements Provider {
  readonly id = "jj";
  readonly displayName = "Jujutsu (jj)";
  readonly installHint = "winget install martinvonz.jj";

  async isAvailable(): Promise<boolean> {
    return commandExists("jj");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("jj", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/jj\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("jj-vcs/jj");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("jj");
    return [
      {
        id: "jj",
        name: "Jujutsu",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "jj",
      binary: "jj",
      packageIds: {
        scoop: "jj",
        winget: "martinvonz.jj",
      },
      manualMessage:
        "TÃ©lÃ©charger https://github.com/jj-vcs/jj/releases ou `cargo install --locked jj-cli`",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("jj")];
  }
}
