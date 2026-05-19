import { commandExists, run } from "../../core/runner.js";
import {
  delegateUpdate,
  describeSource,
  detectInstallSource,
} from "../../core/install-source.js";
import { fetchGitHubReleaseLatest } from "../../core/gh-releases.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * nvm-windows (coreybutler/nvm-windows) â€” distinct from the Linux/macOS
 * `nvm` shell function. Binary is `nvm.exe`. Scope is the nvm binary itself,
 * not the Node versions it manages.
 *
 * `nvm version` prints e.g. "1.1.12".
 * No self-update path: delegate to the PM that installed it.
 */
export class NvmWindowsProvider implements Provider {
  readonly id = "nvm-windows";
  readonly displayName = "nvm-windows";
  readonly installHint = "winget install CoreyButler.NVMforWindows";

  async isAvailable(): Promise<boolean> {
    if (process.platform !== "win32") return false;
    if (!(await commandExists("nvm"))) return false;
    // Disambiguate from a stray `nvm` shell shim by checking the help banner.
    const { stdout, failed } = await run("nvm", ["version"]);
    if (failed) return false;
    return /^\s*v?\d+\.\d+/.test(stdout);
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    const { stdout, failed } = await run("nvm", ["version"]);
    if (failed) return [];

    const match = stdout.match(/v?([0-9][\w.+-]*)/);
    const current = match?.[1];
    if (!current) return [];

    const latest = await fetchGitHubReleaseLatest("coreybutler/nvm-windows");
    if (!latest || latest === current) return [];

    const source = await detectInstallSource("nvm");
    return [
      {
        id: "nvm-windows",
        name: "nvm-windows",
        current,
        latest,
        note: describeSource(source),
        ...(source === "manual" && { manual: true }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    return delegateUpdate({
      id: "nvm-windows",
      binary: "nvm",
      packageIds: {
        scoop: "nvm",
        choco: "nvm",
        winget: "CoreyButler.NVMforWindows",
      },
      manualMessage:
        "TÃ©lÃ©charger https://github.com/coreybutler/nvm-windows/releases et exÃ©cuter nvm-setup.exe",
    });
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("nvm-windows")];
  }
}
