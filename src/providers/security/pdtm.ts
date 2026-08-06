import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * ProjectDiscovery Tool Manager (pdtm). Updates all PD tools at once via
 * `pdtm -ua`. The binary itself self-updates with `pdtm -up`.
 *
 * `pdtm -version` prints "Current Version: v0.0.9".
 */
export class PdtmProvider implements Provider {
  readonly id = "pdtm";
  readonly displayName = "ProjectDiscovery tool manager";
  readonly installHint = pickInstallHint({
    win32: "https://github.com/projectdiscovery/pdtm",
    fallback: "brew install pdtm",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("pdtm");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, stderr, failed } = await run("pdtm", ["-version"]);
    if (failed && !stdout && !stderr) return [];

    const combined = `${stdout}\n${stderr}`;
    const match = combined.match(/Current\s+Version:\s*v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("projectdiscovery/pdtm");
    if (!latest || latest === current) return [];

    return [{ id: "pdtm", name: "pdtm", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    // `-up` self-updates the binary; `-ua` updates managed tools.
    // We chain both so a user-triggered update brings the whole suite forward.
    const self = await runInherit("pdtm", ["-up"]);
    if (self.failed) return { id: "pdtm", success: false };
    const tools = await runInherit("pdtm", ["-ua"]);
    return { id: "pdtm", success: !tools.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("pdtm")];
  }
}
