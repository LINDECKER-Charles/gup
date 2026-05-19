import { commandExists, run, runInherit } from "../../core/runner.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Helm chart repositories. Distinct from the `helm` binary provider:
 * this one runs `helm repo update` to refresh the local repo cache
 * (no per-chart upgrade â€” Helm doesn't track installed releases without
 * cluster connectivity).
 *
 * Surfaces as one synthetic "all repos" entry whenever at least one repo
 * is configured: there's no cheap way to know in advance if any repo has
 * actually moved, so we always flag it as an available action.
 */
export class HelmRepoProvider implements Provider {
  readonly id = "helm-repo";
  readonly displayName = "Helm repositories";
  readonly installHint = "winget install Helm.Helm";

  async isAvailable(): Promise<boolean> {
    if (!(await commandExists("helm"))) return false;
    const { stdout, failed } = await run("helm", ["repo", "list", "-o", "json"]);
    if (failed) return false;
    try {
      const parsed = JSON.parse(stdout) as unknown[];
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("helm", ["repo", "list", "-o", "json"]);
    if (failed) return [];
    let repos: Array<{ name?: string; url?: string }> = [];
    try {
      repos = JSON.parse(stdout) as typeof repos;
    } catch {
      return [];
    }
    if (repos.length === 0) return [];

    return [
      {
        id: "all",
        name: "helm repo update",
        current: "?",
        latest: "refresh",
        note: `${repos.length} repo(s) configurÃ©s`,
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("helm", ["repo", "update"]);
    return { id: "all", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("all")];
  }
}
