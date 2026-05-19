import { existsSync } from "node:fs";
import { join } from "node:path";
import { commandExists, runInherit } from "../../core/runner.js";
import { nvimDataDir } from "../../core/nvim-paths.js";
import type { OutdatedPackage, Provider, UpdateOutcome } from "../../core/types.js";

/**
 * packer.nvim. Detection: the conventional packer install path under nvim
 * data (`site/pack/packer/start/packer.nvim`). PackerSync is async â€” pair
 * it with an autocmd that quits once the User PackerComplete event fires
 * so the headless invocation actually returns.
 */
export class NvimPackerProvider implements Provider {
  readonly id = "nvim-packer";
  readonly displayName = "packer.nvim";
  readonly installHint = "https://github.com/wbthomason/packer.nvim";

  async isAvailable(): Promise<boolean> {
    if (!(await commandExists("nvim"))) return false;
    const dir = join(
      nvimDataDir(),
      "site",
      "pack",
      "packer",
      "start",
      "packer.nvim",
    );
    return existsSync(dir);
  }

  async listOutdated(): Promise<OutdatedPackage[]> {
    return [
      {
        id: "all",
        name: "packer.nvim sync",
        current: "?",
        latest: "refresh",
        note: "Synchronise tous les plugins (:PackerSync)",
      },
    ];
  }

  async update(_packageId: string): Promise<UpdateOutcome> {
    const res = await runInherit("nvim", [
      "--headless",
      "-c",
      "autocmd User PackerComplete quitall",
      "-c",
      "PackerSync",
    ]);
    return { id: "all", success: !res.failed };
  }

  async updateAll(packages: OutdatedPackage[]): Promise<UpdateOutcome[]> {
    if (packages.length === 0) return [];
    return [await this.update("all")];
  }
}
