import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Helm plugins. `helm plugin list` prints a TSV-ish header (NAME / VERSION /
 * DESCRIPTION). Helm exposes no per-plugin "outdated" probe and a plugin's
 * upstream version lookup would require parsing its source URL — we instead
 * surface a synthetic refresh entry whenever at least one plugin is
 * installed, and delegate the actual upgrade to `helm plugin update --all`
 * (idempotent if everything is current).
 */
export class HelmPluginsProvider implements Provider {
  readonly id = "helm-plugins";
  readonly displayName = "Helm plugins";
  readonly installHint = "helm plugin install <url>";

  async isAvailable(): Promise<boolean> {
    if (!(await commandExists("helm"))) return false;
    const { stdout, failed } = await run("helm", ["plugin", "list"]);
    if (failed) return false;
    return parsePluginNames(stdout).length > 0;
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("helm", ["plugin", "list"]);
    if (failed) return [];
    const plugins = parsePluginNames(stdout);
    if (plugins.length === 0) return [];

    return [
      {
        id: "all",
        name: "helm plugin update --all",
        current: "?",
        latest: "refresh",
        note: `${plugins.length} plugin(s) installé(s)`,
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("helm", ["plugin", "update", "--all"]);
    return { id: "all", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("all")];
  }
}

function parsePluginNames(output: string): string[] {
  const lines = output.split(/\r?\n/);
  const headerIdx = lines.findIndex((l) => /^NAME\s+VERSION/i.test(l));
  if (headerIdx === -1) return [];
  const out: string[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (!line.trim()) continue;
    const name = line.trim().split(/\s+/)[0];
    if (name) out.push(name);
  }
  return out;
}
