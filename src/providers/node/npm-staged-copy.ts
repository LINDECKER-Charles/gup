import { createHash } from "node:crypto";
import { lstat, readdir, readFile, rename, rmdir } from "node:fs/promises";
import { log } from "../../core/log/log.js";
import { pathFlavour } from "../../core/platform/path-flavour.js";

/**
 * npm's rollback of a global install, played after the fact.
 *
 * Before it fetches the new version of a global package, npm moves the
 * installed one aside — `<root>/<name>` becomes `<root>/.<name>-<hash>`, each
 * of its commands likewise — and creates an empty directory for the new one.
 * When the install fails, npm moves the old copy back. A tree kill (a skip, a
 * stop, the install timeout) ends npm before it can: the package and its
 * commands are gone, the hidden copy is all that is left
 * (`@npmcli/arborist`: `retire-path.js`, `[_retireShallowNodes]` in `reify.js`).
 *
 * Called after the installer's whole tree is gone (the runner and the
 * embedded terminal guarantee it): npm moving the copy back at the same time
 * would delete what this restored.
 */

/** What became of a package an interrupted npm may have left staged. */
export type StagedCopyFate =
  /** Nothing staged: npm finished, rolled back, or never got that far. */
  | { readonly kind: "none" }
  /** The staged copy and its commands are back in place. */
  | { readonly kind: "restored" }
  /** npm had begun writing the new version there: left alone, the old copy at `path`. */
  | { readonly kind: "kept"; readonly path: string };

const NONE: StagedCopyFate = { kind: "none" };

/** A registry package name, scoped or not: never a path that leaves `root`. */
// eslint-disable-next-line security/detect-unsafe-regex -- anchored, no nested quantifier; the optional scope ends at a literal '/', so matching is linear
const PACKAGE_NAME = /^(?:@[a-z0-9][\w.~-]*\/)?[a-z0-9][\w.~-]*$/i;

/** npm's suffix: the first 8 alphanumerics of the base64 SHA-1 of the path. */
const HASH_LENGTH = 8;
const STAGED_SUFFIX = new RegExp(`^[A-Za-z0-9]{${HASH_LENGTH}}$`);

/** Commands npm links next to a global package: a shell shim and, on Windows, two more. */
const WINDOWS_SHIM_SUFFIXES = ["", ".cmd", ".ps1"] as const;

const TRANSIENT_ERRORS = new Set(["EPERM", "EBUSY", "EACCES"]);
const MOVE_ATTEMPTS = 5;
const MOVE_BACKOFF_MS = 200;

type PathApi = ReturnType<typeof pathFlavour>;

/**
 * Move npm's staged copy of `packageId` back under `root` (`npm root -g`)
 * when the package's own directory is missing or empty, and its commands
 * with it. Never throws: whatever cannot be read or moved is left as it is.
 */
export async function restoreStagedCopy(root: string, packageId: string): Promise<StagedCopyFate> {
  if (!PACKAGE_NAME.test(packageId)) return NONE;
  const path = pathFlavour();
  const target = path.join(root, ...packageId.split("/"));
  try {
    const staged = await findStaged(target, path);
    if (staged === null) return NONE;
    if (!(await isMissingOrEmpty(target))) {
      log.warn("npm.staged-copy-kept", { packageId, staged });
      return { kind: "kept", path: staged };
    }
    await moveBack(staged, target);
    await restoreCommands(root, target, path);
    log.warn("npm.staged-copy-restored", { packageId, path: target });
    return { kind: "restored" };
  } catch (error) {
    log.warn("npm.staged-copy-failed", { packageId, error: String(error) });
    return NONE;
  }
}

/**
 * The copy npm staged for `target`: the one whose suffix is npm's hash of
 * this very path, else the only `.<name>-<8 alphanumerics>` there is (npm
 * may have spelled the path differently: drive letter case, a symlinked
 * prefix). Null when there is none, or several and none is ours.
 */
async function findStaged(target: string, path: PathApi): Promise<string | null> {
  const dir = path.dirname(target);
  const prefix = `.${path.basename(target)}-`;
  const candidates = (await listOrEmpty(dir)).filter(
    (name) => name.startsWith(prefix) && STAGED_SUFFIX.test(name.slice(prefix.length)),
  );
  const exact = `${prefix}${npmPathHash(target)}`;
  if (candidates.includes(exact)) return path.join(dir, exact);
  return candidates.length === 1 ? path.join(dir, candidates[0] ?? "") : null;
}

function npmPathHash(target: string): string {
  const digest = createHash("sha1").update(target).digest("base64");
  return digest.replace(/[^a-zA-Z0-9]+/g, "").slice(0, HASH_LENGTH);
}

async function listOrEmpty(dir: string): Promise<string[]> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- read-only listing of npm's global node_modules (or its bin dir), resolved from `npm root -g`: the user's own prefix, same trust boundary as the process
    return await readdir(dir);
  } catch {
    return [];
  }
}

async function isMissingOrEmpty(dir: string): Promise<boolean> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- read-only probe of a package directory under the user's own global npm root
    return (await readdir(dir)).length === 0;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

/** Rename `staged` onto `target`, once the empty directory npm created there is gone. */
async function moveBack(staged: string, target: string): Promise<void> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- removes only the empty directory npm left at the package's own path under the user's global root; rmdir refuses a non-empty directory
    await rmdir(target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  await renameWithRetry(staged, target);
}

/**
 * Windows refuses a rename while a handle on the directory is still open —
 * the killed npm's, the antivirus scanning what it wrote. Those go quickly.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- moves npm's staged copy back to its original path, both inside the user's own global npm prefix
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (attempt >= MOVE_ATTEMPTS || !TRANSIENT_ERRORS.has(code)) throw error;
      await new Promise((resolve) => setTimeout(resolve, MOVE_BACKOFF_MS));
    }
  }
}

/** Each command the restored package declares, moved back where npm had linked it. */
async function restoreCommands(root: string, packageDir: string, path: PathApi): Promise<void> {
  const binDir = commandDir(root, path);
  for (const name of await commandNames(packageDir, path)) {
    for (const shim of commandShims(binDir, name, path)) {
      const staged = await findStaged(shim, path);
      if (staged !== null && (await isAbsent(shim))) await renameWithRetry(staged, shim);
    }
  }
}

/** `<prefix>` on Windows, `<prefix>/bin` elsewhere — `root` being `<prefix>[/lib]/node_modules`. */
function commandDir(root: string, path: PathApi): string {
  const isWindows = process.platform === "win32";
  return isWindows ? path.dirname(root) : path.join(path.dirname(path.dirname(root)), "bin");
}

function commandShims(binDir: string, name: string, path: PathApi): string[] {
  const suffixes = process.platform === "win32" ? WINDOWS_SHIM_SUFFIXES : [""];
  return suffixes.map((suffix) => path.join(binDir, `${name}${suffix}`));
}

/**
 * The command names of a package, as npm links them: the keys of its `bin`
 * map, or its unscoped name for a single `bin` path. Names are reduced to
 * their last segment — a name is never a path.
 */
async function commandNames(packageDir: string, path: PathApi): Promise<string[]> {
  let manifest: { name?: unknown; bin?: unknown };
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- read-only read of the restored package's own package.json under the user's global npm root
    manifest = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf8")) as {
      name?: unknown;
      bin?: unknown;
    };
  } catch {
    return [];
  }
  const { name, bin } = manifest;
  const names = typeof bin === "string" ? [String(name ?? "")] : Object.keys(bin ?? {});
  return names.map((entry) => entry.split(/[\\/:]/).pop() ?? "").filter((entry) => entry !== "");
}

async function isAbsent(path: string): Promise<boolean> {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- read-only existence probe of a command shim in the user's own npm bin dir
    await lstat(path);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}
