import { commandExists, run, runInherit } from "../../core/runner.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * goenv (go-nv/goenv) â€” Go version manager. Almost always installed as a
 * git clone of the repo; in that case `goenv update` (the bundled command
 * provided by the `goenv-update` plugin) fast-forwards to upstream.
 *
 * `goenv --version` prints "goenv 2.2.13".
 *
 * No native Windows binary distribution; we still keep the check open since
 * a user may run gup inside Git Bash with a manual install.
 */
export class GoenvProvider implements Provider {
  readonly id = "goenv";
  readonly displayName = "goenv";
  readonly installHint = "https://github.com/go-nv/goenv";

  async isAvailable(): Promise<boolean> {
    return commandExists("goenv");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("goenv", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/goenv\s+v?([0-9][\w.+-]*)/i);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("go-nv/goenv");
    if (!latest || latest === current) return [];

    return [{ id: "goenv", name: "goenv", current, latest, note: "goenv update" }];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    // `goenv update` is provided by the bundled goenv-update plugin and is
    // the canonical self-update path for git-clone installs. Falls back to
    // failure if the plugin isn't present â€” user can refresh via git pull.
    const res = await runInherit("goenv", ["update"]);
    if (res.failed) {
      return {
        id: "goenv",
        success: false,
        skipped: true,
        message:
          "`goenv update` indisponible â€” mettre Ã  jour via `git -C $(goenv root) pull`",
      };
    }
    return { id: "goenv", success: true };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("goenv")];
  }
}
