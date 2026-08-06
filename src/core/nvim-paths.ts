import path from "node:path";

/**
 * Shared filesystem layout helpers for Neovim plugin managers (lazy, packer,
 * mason, vim-plug). Mirrors `:lua print(vim.fn.stdpath('config'/'data'))` so
 * detection works without spawning nvim.
 *
 * Neovim follows XDG on every Unix, so macOS shares the POSIX branch with
 * Linux (`~/.config/nvim`, `~/.local/share/nvim`) — it does NOT use
 * `~/Library/Application Support`. Path flavours are explicit (`path.win32`
 * / `path.posix`) so the separator follows the *target* platform rather than
 * the host running the process.
 */

export function nvimConfigDir(): string {
  if (process.platform === "win32") {
    const local = process.env["LOCALAPPDATA"];
    return local ? path.win32.join(local, "nvim") : "";
  }
  const xdg = process.env["XDG_CONFIG_HOME"];
  if (xdg) return path.posix.join(xdg, "nvim");
  const home = process.env["HOME"];
  return home ? path.posix.join(home, ".config", "nvim") : "";
}

export function nvimDataDir(): string {
  if (process.platform === "win32") {
    const local = process.env["LOCALAPPDATA"];
    return local ? path.win32.join(local, "nvim-data") : "";
  }
  const xdg = process.env["XDG_DATA_HOME"];
  if (xdg) return path.posix.join(xdg, "nvim");
  const home = process.env["HOME"];
  return home ? path.posix.join(home, ".local", "share", "nvim") : "";
}
