import { existsSync } from "node:fs";
import { join } from "node:path";
import { commandExists, runInherit } from "../../core/runner.js";
import { nvimConfigDir, nvimDataDir } from "../../core/nvim-paths.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * vim-plug. Detection: `plug.vim` under `<config>/autoload` (vim or nvim
 * variant) plus an existing plugin directory under `<data>/plugged` or
 * `<data>/site/autoload/plug.vim`. We prefer nvim for headless invocation
 * (`vim --headless` is not standard), falling back to vim when nvim isn't
 * present.
 */
export class VimPlugProvider implements Provider {
  readonly id = "vim-plug";
  readonly displayName = "vim-plug";
  readonly installHint = "https://github.com/junegunn/vim-plug";

  async isAvailable(): Promise<boolean> {
    if (!(await commandExists("nvim"))) return false;
    const candidates = [
      join(nvimConfigDir(), "autoload", "plug.vim"),
      join(nvimDataDir(), "site", "autoload", "plug.vim"),
      join(nvimDataDir(), "plugged"),
    ];
    return candidates.some((p) => existsSync(p));
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    return [
      {
        id: "all",
        name: "vim-plug update",
        current: "?",
        latest: "refresh",
        note: "Met Ã  jour tous les plugins (:PlugUpdate --sync)",
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("nvim", [
      "--headless",
      "+PlugUpdate --sync",
      "+qa",
    ]);
    return { id: "all", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("all")];
  }
}
