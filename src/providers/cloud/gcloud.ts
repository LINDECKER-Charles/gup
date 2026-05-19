import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

interface GcloudComponentJson {
  id: string;
  name?: string;
  state?: { name?: string };
  current_version_string?: string;
  latest_version_string?: string;
}

/**
 * `gcloud components list --format=json` exposes both the installed and the
 * latest version for every component. We only surface those where the state
 * is "Update Available" with both versions populated.
 */
export class GcloudProvider implements Provider {
  readonly id = "gcloud";
  readonly displayName = "gcloud components";
  readonly installHint = "https://cloud.google.com/sdk/docs/install";

  async isAvailable(): Promise<boolean> {
    return commandExists("gcloud");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("gcloud", [
      "components",
      "list",
      "--format=json",
      "--quiet",
    ]);
    if (failed || !stdout.trim()) return [];

    let parsed: GcloudComponentJson[];
    try {
      parsed = JSON.parse(stdout) as GcloudComponentJson[];
    } catch {
      return [];
    }

    const out: OutdatedPackage[] = [];
    for (const c of parsed) {
      const state = c.state?.name ?? "";
      if (!/update available/i.test(state)) continue;
      const current = c.current_version_string;
      const latest = c.latest_version_string;
      if (!current || !latest || current === latest) continue;
      out.push({ id: c.id, name: c.name ?? c.id, current, latest });
    }
    return out;
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    // gcloud's component manager refuses partial component updates â€” the whole
    // SDK is bumped at once. Same call for any package id.
    const res = await runInherit("gcloud", ["components", "update", "--quiet"]);
    return { id: "gcloud", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    const res = await runInherit("gcloud", ["components", "update", "--quiet"]);
    return packages.map((p) => ({ id: p.id, success: !res.failed }));
  }
}
