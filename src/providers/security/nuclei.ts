import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Nuclei (ProjectDiscovery) — vulnerability scanner. Has built-in
 * `-update` self-update. Version line: "Nuclei Engine Version: v3.2.9".
 */
export class NucleiProvider implements Provider {
  readonly id = "nuclei";
  readonly displayName = "Nuclei";
  readonly installHint = pickInstallHint({
    win32: "https://docs.projectdiscovery.io/tools/nuclei/install",
    fallback: "brew install nuclei",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("nuclei");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, stderr, failed } = await run("nuclei", ["-version"]);
    if (failed && !stdout && !stderr) return [];

    const combined = `${stdout}\n${stderr}`;
    const match = combined.match(/Nuclei\s+Engine\s+Version:\s*v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("projectdiscovery/nuclei");
    if (!latest || latest === current) return [];

    return [{ id: "nuclei", name: "Nuclei", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("nuclei", ["-update"]);
    return { id: "nuclei", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("nuclei")];
  }
}
