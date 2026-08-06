import { commandExists, run, runInherit } from "../../core/runner.js";
import {
  describeSource,
  detectInstallSource,
  runPmUpdate,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import { pickInstallHint } from "../../core/install-hint.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * Heroku CLI. `heroku --version` prints:
 *   heroku/8.7.1 win32-x64 node-v16.19.1
 *
 * Standalone tarball installs ship with a built-in `heroku update`. npm-based
 * installs cannot use it (npm-g provider covers those independently), so we
 * delegate when we detect a non-manual install.
 */
export class HerokuProvider implements Provider {
  readonly id = "heroku";
  readonly displayName = "Heroku CLI";
  readonly installHint = pickInstallHint({
    win32: "https://devcenter.heroku.com/articles/heroku-cli",
    fallback: "brew install heroku",
  });

  async isAvailable(): Promise<boolean> {
    return commandExists("heroku");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("heroku", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/heroku\/(?:v)?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("heroku/cli");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("heroku");
    return [
      {
        id: "heroku",
        name: "Heroku CLI",
        current,
        latest,
        note: describeSource(source),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const source = await detectInstallSource("heroku");
    if (source !== "manual") {
      return runPmUpdate(
        "heroku",
        source,
        {
          scoop: "heroku-cli",
          choco: "heroku-cli",
          winget: "Heroku.HerokuCLI",
          brew: "heroku",
        },
        "Réinstaller depuis https://devcenter.heroku.com/articles/heroku-cli",
      );
    }
    // Standalone tarball install: built-in updater.
    const res = await runInherit("heroku", ["update"]);
    return { id: "heroku", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("heroku")];
  }
}
