import { commandExists, run, runInherit } from "../../core/runner.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * PHIVE (PHAR Installation and Verification Environment). The binary itself
 * supports `phive selfupdate`. Per-tool PHARs are project-scoped (driven by
 * `phars.xml`), so we only surface PHIVE itself.
 *
 * `phive --version` prints "phive 0.15.2 ...".
 */
export class PhiveProvider implements Provider {
  readonly id = "phive";
  readonly displayName = "PHIVE";
  readonly installHint = "https://phar.io/";

  async isAvailable(): Promise<boolean> {
    return commandExists("phive");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("phive", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/phive\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("phar-io/phive");
    if (!latest || latest === current) return [];

    return [{ id: "phive", name: "PHIVE", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("phive", ["selfupdate"]);
    return { id: "phive", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("phive")];
  }
}
