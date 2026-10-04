import { constants } from "node:fs";
import { access, lstat, stat } from "node:fs/promises";
import path from "node:path";

/**
 * PATH resolution, done in-process. The runner re-exports both functions, so
 * providers keep importing them from `core/runner.js`.
 */

export async function commandExists(command: string): Promise<boolean> {
  return (await whichFirst(command)) !== null;
}

/**
 * Return the absolute path of the first PATH resolution of `command`, or null
 * if not found. Used when the *location* matters (e.g. to verify which install
 * a binary belongs to), not just whether the binary exists.
 *
 * Resolved in-process, never by spawning `where` / `which`. Detection probes
 * ~140 binaries at once, and on Windows each spawn is synchronous main-thread
 * work (execa's command lookup, then CreateProcess): the burst froze the event
 * loop for seconds, and with it the spinner, every timer and Ctrl+C. Async
 * `stat` runs on the libuv threadpool and leaves the loop free.
 *
 * Same answers as the tools it replaces, with one deliberate exception: unlike
 * `where`, the current directory is not searched — a binary that happens to
 * sit in cwd doesn't mean the tool is installed.
 */
export async function whichFirst(command: string): Promise<string | null> {
  if (!isBareCommandName(command)) return null;
  const isWindows = process.platform === "win32";
  // `where` order: per PATH entry, the bare name first (`npm`), then the name
  // plus each PATHEXT extension (`npm.cmd`).
  const suffixes = isWindows ? ["", ...pathExtensions()] : [""];
  for (const dir of pathEntries()) {
    for (const suffix of suffixes) {
      const candidate = path.join(dir, command + suffix);
      if (await isCommandFile(candidate, isWindows)) return candidate;
    }
  }
  return null;
}

/** Path separators or wildcards mean a path or a pattern, never a PATH lookup. */
function isBareCommandName(command: string): boolean {
  return command.length > 0 && !/[\\/:*?"<>|]/.test(command);
}

function pathEntries(): string[] {
  const entries = (process.env.PATH ?? "")
    .split(path.delimiter)
    .map((entry) => entry.trim().replace(/^"(.*)"$/, "$1"))
    .filter((entry) => entry.length > 0);
  return [...new Set(entries)];
}

const DEFAULT_PATHEXT = ".COM;.EXE;.BAT;.CMD";

function pathExtensions(): string[] {
  return (process.env.PATHEXT || DEFAULT_PATHEXT)
    .split(";")
    .map((ext) => ext.trim().toLowerCase())
    .filter((ext) => ext.startsWith("."));
}

/**
 * Windows: any non-directory entry counts, as with `where`. `lstat` rather
 * than `stat` is load-bearing: App Execution Aliases (`WindowsApps\winget.exe`,
 * `python.exe`) are reparse points that `stat` rejects with EACCES.
 * POSIX: a regular file (symlinks followed) with the exec bit, as with `which`.
 */
async function isCommandFile(candidate: string, isWindows: boolean): Promise<boolean> {
  try {
    if (isWindows) {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- read-only metadata probe; candidate is a PATH entry joined with a name that isBareCommandName() cleared of separators
      return !(await lstat(candidate)).isDirectory();
    }
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- same as above
    if (!(await stat(candidate)).isFile()) return false;
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- same as above
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
