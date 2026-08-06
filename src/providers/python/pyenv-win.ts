import { pickInstallHint } from "../../core/install-hint.js";
import { commandExists, run, runInherit } from "../../core/runner.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * pyenv-win — Windows port of pyenv. Has built-in self-update via
 * `pyenv update`. Version: `pyenv --version` -> "pyenv 3.1.1".
 */
export class PyenvWinProvider implements Provider {
  readonly id = "pyenv-win";
  readonly displayName = "pyenv-win";
  // Port Windows-only : hors win32, c'est le pyenv amont (pyenv/pyenv) qu'il
  // faut installer, un projet distinct avec sa propre formule Homebrew.
  readonly installHint = pickInstallHint({
    win32: "https://github.com/pyenv-win/pyenv-win",
    fallback: "Windows uniquement — équivalent macOS/Linux : brew install pyenv",
  });

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "win32") return false;
    return commandExists("pyenv");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("pyenv", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/pyenv\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("pyenv-win/pyenv-win");
    if (!latest || latest === current) return [];

    return [{ id: "pyenv-win", name: "pyenv-win", current, latest }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("pyenv", ["update"]);
    return { id: "pyenv-win", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("pyenv-win")];
  }
}
