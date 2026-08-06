import { existsSync } from "node:fs";
import { join } from "node:path";
import { commandExists, runInherit } from "../../core/runner.js";
import { nvimDataDir } from "../../core/nvim-paths.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * mason.nvim — LSP/DAP/linter/formatter manager.
 *
 * `:MasonUpdate` refreshes Mason's package registries. Upgrading installed
 * packages individually requires `:MasonInstall <name>` (Mason has no
 * built-in "upgrade all"). We invoke `:MasonUpdate` followed by Mason's
 * own log-driven upgrade prompt — users who want bulk upgrades should rely
 * on `mason-tool-installer` plugin (`:MasonToolsUpdate`), which we attempt
 * silently if defined.
 */
export class NvimMasonProvider implements Provider {
  readonly id = "nvim-mason";
  readonly displayName = "mason.nvim";
  readonly installHint = "https://github.com/williamboman/mason.nvim";

  async isAvailable(): Promise<boolean> {
    if (!(await commandExists("nvim"))) return false;
    return existsSync(join(nvimDataDir(), "mason"));
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    return [
      {
        id: "all",
        name: "mason update",
        current: "?",
        latest: "refresh",
        note: "Met à jour les registres + outils Mason",
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    // Run MasonUpdate first (refreshes registry), then attempt
    // :MasonToolsUpdate when the optional companion plugin is loaded;
    // `silent!` swallows the E492 "not an editor command" if absent.
    const res = await runInherit("nvim", [
      "--headless",
      "-c",
      "MasonUpdate",
      "-c",
      "silent! MasonToolsUpdate",
      "-c",
      "qa",
    ]);
    return { id: "all", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("all")];
  }
}
