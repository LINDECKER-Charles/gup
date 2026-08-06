import path from "node:path";
import { whichFirst } from "./runner.js";

/**
 * Detect whether a package manager binary on PATH is actually a Corepack shim.
 *
 * Corepack installs its shims next to `corepack` itself (the Node bin dir).
 * A standalone install (e.g. `%LOCALAPPDATA%\pnpm\pnpm.CMD` from the pnpm
 * installer, or a winget/scoop-managed binary) lives elsewhere and wins PATH
 * resolution over the corepack shim — meaning `corepack prepare <pm>@latest
 * --activate` updates the corepack cache that nothing on PATH consults.
 *
 * We treat a binary as corepack-owned only when its first PATH resolution
 * shares a directory with corepack. Anything else stays with SelfProvider.
 */
export async function isCorepackShim(binary: string): Promise<boolean> {
  const [corepackPath, binaryPath] = await Promise.all([
    whichFirst("corepack"),
    whichFirst(binary),
  ]);
  if (!corepackPath || !binaryPath) return false;

  // Windows paths are case-insensitive and `where` echoes back the casing of
  // the PATH entry it matched, so `C:\Program Files\nodejs` and
  // `C:\PROGRAM FILES\NODEJS` must compare equal — hence the lowercasing.
  // That trick is wrong on POSIX, where `/usr/bin` and `/usr/BIN` are two
  // distinct directories: folding the case there could claim corepack owns a
  // binary that lives somewhere else entirely.
  if (process.platform === "win32") {
    return (
      path.win32.dirname(corepackPath).toLowerCase() ===
      path.win32.dirname(binaryPath).toLowerCase()
    );
  }
  return path.posix.dirname(corepackPath) === path.posix.dirname(binaryPath);
}
