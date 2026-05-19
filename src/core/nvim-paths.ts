import { join } from "node:path";

/**
 * Shared filesystem layout helpers for Neovim plugin managers (lazy, packer,
 * mason, vim-plug). Mirrors `:lua print(vim.fn.stdpath('config'/'data'))` so
 * detection works without spawning nvim.
 */

export function nvimConfigDir(): string {
  if (process.platform === "win32") {
    const local = process.env["LOCALAPPDATA"];
    return local ? join(local, "nvim") : "";
  }
  const xdg = process.env["XDG_CONFIG_HOME"];
  if (xdg) return join(xdg, "nvim");
  const home = process.env["HOME"];
  return home ? join(home, ".config", "nvim") : "";
}

export function nvimDataDir(): string {
  if (process.platform === "win32") {
    const local = process.env["LOCALAPPDATA"];
    return local ? join(local, "nvim-data") : "";
  }
  const xdg = process.env["XDG_DATA_HOME"];
  if (xdg) return join(xdg, "nvim");
  const home = process.env["HOME"];
  return home ? join(home, ".local", "share", "nvim") : "";
}
