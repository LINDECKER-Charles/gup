import { constants } from "node:fs";
import { access, chmod, stat } from "node:fs/promises";
import { join } from "node:path";

/**
 * node-pty spawns every macOS child through a small `spawn-helper` binary, and
 * the published tarball ships the prebuilt one as 0644: installed with
 * `--ignore-scripts`, or by a package manager that does not restore modes,
 * every spawn then fails with `posix_spawnp failed`. gup restores the exec bit
 * once, when the file belongs to the current user; otherwise it says which
 * file needs `chmod +x`.
 */

const EXECUTABLE_MODE = 0o755;

/** Who runs gup: the prebuild's architecture and the file owner that may be fixed. */
export interface HelperHost {
  readonly arch: string;
  readonly uid: number | undefined;
}

/**
 * Null when the helper is ready — or absent (no prebuild for this
 * architecture: node-pty uses its own build). Otherwise the path of a helper
 * gup could not make executable.
 */
export async function ensureSpawnHelper(
  packageDir: string,
  host: HelperHost = runningHost(),
): Promise<string | null> {
  const helper = join(packageDir, "prebuilds", `darwin-${host.arch}`, "spawn-helper");
  if (await isExecutable(helper)) return null;
  const owner = await ownerOf(helper);
  if (owner === null) return null;
  if (owner !== host.uid) return helper;
  await chmod(helper, EXECUTABLE_MODE).catch(() => {});
  return (await isExecutable(helper)) ? null : helper;
}

function runningHost(): HelperHost {
  return { arch: process.arch, uid: process.getuid?.() };
}

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** The owner's uid, or null when the file does not exist. */
async function ownerOf(path: string): Promise<number | null> {
  try {
    return (await stat(path)).uid;
  } catch {
    return null;
  }
}
