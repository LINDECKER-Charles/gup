import { commandExists, run, runInherit } from "../../core/runner.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * asdf-vm â€” poly-runtime version manager. Two install eras:
 *  - Pre-0.16: shell-script install (git clone) â†’ `asdf update` works.
 *  - 0.16+: Go rewrite distributed as a binary â†’ no built-in self-update;
 *    must be replaced via the source PM (apt, brew, package install).
 *
 * Both honor `asdf --version`. Output examples:
 *  - "v0.14.0-abc1234" (legacy)
 *  - "0.16.7 (revision abc1234)" (Go rewrite)
 *
 * Windows is not officially supported by asdf; this provider only activates
 * when the binary is actually present in PATH (typically WSL or Git Bash
 * pass-through).
 */
export class AsdfProvider implements Provider {
  readonly id = "asdf";
  readonly displayName = "asdf-vm";
  readonly installHint = "https://asdf-vm.com/guide/getting-started.html";

  async isAvailable(): Promise<boolean> {
    return commandExists("asdf");
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("asdf", ["--version"]);
    if (failed) return [];

    const match = stdout.match(/v?([0-9]+\.[0-9]+\.[0-9]+(?:-[\w.]+)?)/);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("asdf-vm/asdf");
    if (!latest) return [];

    // Compare on the numeric core only â€” strip any "-<sha>" suffix.
    const currentCore = current.split("-")[0];
    if (currentCore === latest) return [];

    const isLegacy = isLegacyInstall(current);
    return [
      {
        id: "asdf",
        name: "asdf",
        current,
        latest,
        note: isLegacy ? "asdf update" : "binaire â€” rÃ©installer via le PM source",
        ...(!isLegacy && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const { stdout } = await run("asdf", ["--version"]);
    if (!isLegacyInstall(stdout)) {
      return {
        id: "asdf",
        success: false,
        skipped: true,
        message:
          "asdf 0.16+ est distribuÃ© en binaire â€” rÃ©installer via apt/brew/scoop/manuel",
      };
    }
    const res = await runInherit("asdf", ["update"]);
    return { id: "asdf", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("asdf")];
  }
}

/**
 * Pre-0.16 versions advertise themselves with a leading "v" and a git-sha
 * suffix (e.g. "v0.14.0-abc1234"). The Go rewrite drops the "v" and uses a
 * "(revision â€¦)" suffix instead.
 */
function isLegacyInstall(versionOutput: string): boolean {
  return /v0\.(?:[0-9]|1[0-5])\b/.test(versionOutput);
}
