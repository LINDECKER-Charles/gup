import { commandExists, run, runInherit } from "../../core/runner.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * GitLab CLI (`glab`). Has a built-in `glab check-update` but exit codes are
 * unreliable; we drive the diff ourselves and use `glab update` to apply it
 * when the binary supports it (recent versions). Fallback: report skipped.
 *
 * Version line: "glab version 1.42.0 (...)"
 */
export class GlabProvider implements Provider {
  readonly id = "glab";
  readonly displayName = "GitLab CLI";
  readonly installHint = "winget install GitLab.GitLabCli";

  async isAvailable(): Promise<boolean> {
    return commandExists("glab");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("glab", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/glab\s+version\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("profclems/glab");
    if (!latest || latest === current) return [];

    return [{ id: "glab", name: "GitLab CLI", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    // `glab update` is the official self-update path (since 1.40).
    const res = await runInherit("glab", ["update"]);
    return { id: "glab", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("glab")];
  }
}
