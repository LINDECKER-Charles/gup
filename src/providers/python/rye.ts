import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists, run, runInherit } from "../../core/runner.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Rye (Python project & toolchain manager). Self-update via `rye self update`.
 * `rye --version` prints "rye 0.39.0\ncommit: ...".
 */
export class RyeProvider implements Provider {
  readonly id = "rye";
  readonly displayName = "Rye";
  readonly installHint = pickInstallHint({
    win32: "https://rye.astral.sh/",
    fallback: "brew install rye",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("rye");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("rye", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/rye\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("astral-sh/rye");
    if (!latest || latest === current) return [];

    return [{ id: "rye", name: "Rye", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("rye", ["self", "update"]);
    return { id: "rye", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("rye")];
  }
}
