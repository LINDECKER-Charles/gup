import { commandExists, run, runInherit } from "../../core/runner.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Conda / mamba self-update. We don't touch project envs â€” `conda update --all`
 * is scoped to the `base` env where conda itself lives, which is what the
 * catalog calls out. Scan compares the conda binary to the latest GitHub
 * release; the actual `update --all` runs side-effects beyond a single
 * version bump, so we surface a single "conda" entry as the trigger.
 *
 * `conda --version` prints "conda 24.5.0".
 */
export class CondaProvider implements Provider {
  readonly id = "conda";
  readonly displayName = "Conda";
  readonly installHint = "https://docs.conda.io/projects/conda/en/stable/";

  async isAvailable(): Promise<boolean> {
    return commandExists("conda");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("conda", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/conda\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("conda/conda");
    if (!latest || latest === current) return [];

    return [
      {
        id: "conda",
        name: "Conda (base env)",
        current,
        latest,
        note: "updates conda + base env",
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("conda", [
      "update",
      "--all",
      "-n",
      "base",
      "-y",
    ]);
    return { id: "conda", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("conda")];
  }
}
