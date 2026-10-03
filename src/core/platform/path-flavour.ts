import path from "node:path";

/** `node:path`'s API, as implemented for one platform (`path.win32` or `path.posix`). */
type PathApi = typeof path;

/**
 * The `node:path` flavour that builds paths for `platform`: Windows separators
 * for win32, POSIX ones everywhere else.
 *
 * A path gup derives for a platform (`%LOCALAPPDATA%\gup\history`,
 * `~/.config/nvim/lazy-lock.json`) follows that platform's rules, not the
 * host's: plain `join` would emit `C:\Users\u\AppData\Local/gup` when a test
 * simulates Windows on Linux. At runtime the two always agree, since the
 * default is the running platform.
 */
export function pathFlavour(platform: NodeJS.Platform = process.platform): PathApi {
  return platform === "win32" ? path.win32 : path.posix;
}
