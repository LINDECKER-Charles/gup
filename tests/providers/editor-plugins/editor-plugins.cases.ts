import type { OutdatedPackage, Provider } from "../../../src/core/types.js";
import { NvimLazyProvider } from "../../../src/providers/editor-plugins/nvim-lazy.js";
import { NvimMasonProvider } from "../../../src/providers/editor-plugins/nvim-mason.js";
import { NvimPackerProvider } from "../../../src/providers/editor-plugins/nvim-packer.js";
import { VimPlugProvider } from "../../../src/providers/editor-plugins/vim-plug.js";
import type { ProviderContractCase } from "../../support/contract/types.js";
import { LINUX_HOME, MAC_HOME, WIN_HOME } from "../../support/system/os-identity.js";
import type { FsNode, SimPlatform, SystemSpec } from "../../support/system/types.js";

/**
 * Neovim plugin managers. None can list outdated plugins from outside the
 * editor, so each offers one synthetic "refresh everything" row and runs its
 * own sync in a headless nvim. Detection is nvim on PATH plus the manager's
 * files under nvim's config or data dir (XDG on every POSIX system, macOS
 * included).
 */

export interface NvimDirs {
  readonly config: string;
  readonly data: string;
}

/** nvim's `stdpath('config')` and `stdpath('data')` on each simulated machine. */
export const NVIM_DIRS: Readonly<Record<SimPlatform, NvimDirs>> = {
  win32: {
    config: `${WIN_HOME}\\AppData\\Local\\nvim`,
    data: `${WIN_HOME}\\AppData\\Local\\nvim-data`,
  },
  darwin: { config: `${MAC_HOME}/.config/nvim`, data: `${MAC_HOME}/.local/share/nvim` },
  linux: { config: `${LINUX_HOME}/.config/nvim`, data: `${LINUX_HOME}/.local/share/nvim` },
};

const NVIM_BINARY: Readonly<Record<SimPlatform, string>> = {
  win32: "C:\\Program Files\\Neovim\\bin\\nvim.exe",
  darwin: "/opt/homebrew/bin/nvim",
  linux: "/usr/bin/nvim",
};

/** A plugin script or lock file; anything else a manager looks for is a directory. */
const FILE_NAME = /\.(vim|json)$/;

/** nvim on PATH with `paths` present. */
export function nvimMachine(platform: SimPlatform, paths: readonly string[] = []): SystemSpec {
  const node = (path: string): FsNode => ({ kind: FILE_NAME.test(path) ? "file" : "dir" });
  return {
    platform,
    bin: { nvim: NVIM_BINARY[platform] },
    fs: Object.fromEntries(paths.map((path) => [path, node(path)])),
  };
}

/** The synthetic row of a manager: its sync, never a version. */
function syncRow(name: string, note: string): OutdatedPackage {
  return { id: "all", aggregate: true, name, current: "?", latest: "refresh", note };
}

interface PluginManager {
  readonly create: () => Provider;
  readonly system: SystemSpec;
  readonly row: OutdatedPackage;
  readonly sync: readonly string[];
}

/** One scenario per manager: the row, its headless sync, run once for any number of rows. */
function pluginManagerCase(manager: PluginManager): ProviderContractCase {
  return {
    create: manager.create,
    system: manager.system,
    outdated: [manager.row],
    update: { packageId: "all", installs: [manager.sync] },
    updateAll: "collapsed",
  };
}

const LAZY: PluginManager = {
  create: () => new NvimLazyProvider(),
  system: nvimMachine("win32", [`${NVIM_DIRS.win32.data}\\lazy`]),
  row: syncRow("lazy.nvim sync", "Synchronise tous les plugins (:Lazy! sync)"),
  sync: ["nvim", "--headless", "+Lazy! sync", "+qa"],
};

const MASON: PluginManager = {
  create: () => new NvimMasonProvider(),
  system: nvimMachine("linux", [`${NVIM_DIRS.linux.data}/mason`]),
  row: syncRow("mason update", "Met à jour les registres + outils Mason"),
  // MasonToolsUpdate only exists with mason-tool-installer: `silent!` keeps it optional.
  sync: ["nvim", "--headless", "-c", "MasonUpdate", "-c", "silent! MasonToolsUpdate", "-c", "qa"],
};

const PACKER: PluginManager = {
  create: () => new NvimPackerProvider(),
  system: nvimMachine("darwin", [`${NVIM_DIRS.darwin.data}/site/pack/packer/start/packer.nvim`]),
  row: syncRow("packer.nvim sync", "Synchronise tous les plugins (:PackerSync)"),
  // PackerSync is asynchronous: nvim may only quit once packer says it is done.
  sync: ["nvim", "--headless", "-c", "autocmd User PackerComplete quitall", "-c", "PackerSync"],
};

const VIM_PLUG: PluginManager = {
  create: () => new VimPlugProvider(),
  system: nvimMachine("linux", [`${NVIM_DIRS.linux.config}/autoload/plug.vim`]),
  row: syncRow("vim-plug update", "Met à jour tous les plugins (:PlugUpdate --sync)"),
  sync: ["nvim", "--headless", "+PlugUpdate --sync", "+qa"],
};

export const editorPluginsCases: readonly ProviderContractCase[] = [
  LAZY,
  MASON,
  PACKER,
  VIM_PLUG,
].map(pluginManagerCase);
