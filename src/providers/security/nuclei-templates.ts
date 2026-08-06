import { commandExists, run, runInherit } from "../../core/runner.js";
import { pickInstallHint } from "../../core/install-hint.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Nuclei detection templates — versioned independently from the engine.
 * `nuclei -version` includes a "Nuclei Templates Version: v9.x.y" line.
 * Updated via `nuclei -update-templates`.
 */
export class NucleiTemplatesProvider implements Provider {
  readonly id = "nuclei-templates";
  readonly displayName = "Nuclei templates";
  readonly installHint = pickInstallHint({
    win32: "Installer Nuclei: https://docs.projectdiscovery.io/tools/nuclei/install",
    fallback: "Installer Nuclei: brew install nuclei",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("nuclei");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, stderr, failed } = await run("nuclei", ["-version"]);
    if (failed && !stdout && !stderr) return [];

    const combined = `${stdout}\n${stderr}`;
    const match = combined.match(
      /Nuclei\s+Templates\s+Version:\s*v?([0-9][\w.+-]*)/i,
    );
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("projectdiscovery/nuclei-templates");
    if (!latest || latest === current) return [];

    return [{ id: "nuclei-templates", name: "Nuclei templates", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("nuclei", ["-update-templates"]);
    return { id: "nuclei-templates", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("nuclei-templates")];
  }
}
