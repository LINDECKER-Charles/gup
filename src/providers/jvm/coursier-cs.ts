import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Coursier (`cs`) — Scala/JVM artifact fetcher & launcher.
 *
 * `cs --version` prints "Coursier 2.1.10 (...)" (or just the number on older
 * installs). `cs update` updates every installed app shim.
 */
export class CoursierCsProvider implements Provider {
  readonly id = "coursier-cs";
  readonly displayName = "Coursier (cs)";
  readonly installHint = pickInstallHint({
    win32: "https://get-coursier.io/docs/cli-installation",
    fallback: "brew install coursier",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("cs");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("cs", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/(?:Coursier\s+)?v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("coursier/coursier");
    if (!latest || latest === current) return [];

    return [
      {
        id: "coursier-cs",
        name: "Coursier (cs)",
        current,
        latest,
        note: "runs `cs update` for installed apps",
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("cs", ["update"]);
    return { id: "coursier-cs", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("coursier-cs")];
  }
}
