import { existsSync } from "node:fs";
import { commandExists, runInherit } from "../../core/runner.js";
import { nvimConfigDir, nvimDataDir } from "../../core/nvim-paths.js";
import { pathFlavour } from "../../core/platform/path-flavour.js";
import { localize } from "../../core/i18n/localized.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * lazy.nvim plugin manager. Detection: `lazy/` under nvim data dir or
 * `lazy-lock.json` under nvim config dir. We can't cheaply enumerate
 * outdated plugins from outside the editor (Lazy keeps per-plugin git
 * heads in its lock file, but resolving "latest" requires hitting each
 * upstream remote) — surface a synthetic "sync" entry instead, same
 * shape as the `helm-repo` provider.
 */
export class NvimLazyProvider implements Provider {
  readonly id = "nvim-lazy";
  readonly displayName = "lazy.nvim";
  readonly installHint = "https://github.com/folke/lazy.nvim";

  async isAvailable(): Promise<boolean> {
    if (!(await commandExists("nvim"))) return false;
    // nvim-paths hands back target-platform paths: extend them in kind.
    const { join } = pathFlavour();
    const dataLazy = join(nvimDataDir(), "lazy");
    const lockFile = join(nvimConfigDir(), "lazy-lock.json");
    return existsSync(dataLazy) || existsSync(lockFile);
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    return [
      {
        id: "all",
        aggregate: true,
        name: "lazy.nvim sync",
        current: "?",
        latest: "refresh",
        note: localize({
          en: "Syncs all plugins (:Lazy! sync)",
          fr: "Synchronise tous les plugins (:Lazy! sync)",
        }),
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("nvim", [
      "--headless",
      "+Lazy! sync",
      "+qa",
    ]);
    return { id: "all", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("all")];
  }
}
