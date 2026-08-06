import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * JBang. `jbang version` prints the version on the first line, e.g.
 *   "0.118.0".
 * Self-update via `jbang version --update`.
 */
export class JBangProvider implements Provider {
  readonly id = "jbang";
  readonly displayName = "JBang";
  readonly installHint = pickInstallHint({
    win32: "https://www.jbang.dev/download/",
    fallback: "brew install jbang",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("jbang");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("jbang", ["version"]);
    if (failed) return [];

    const firstLine = stdout.split(/\r?\n/)[0]?.trim() ?? "";
    const match = firstLine.match(/v?([0-9][\w.+-]*)/);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("jbangdev/jbang");
    if (!latest || latest === current) return [];

    return [{ id: "jbang", name: "JBang", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("jbang", ["version", "--update"]);
    return { id: "jbang", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("jbang")];
  }
}
