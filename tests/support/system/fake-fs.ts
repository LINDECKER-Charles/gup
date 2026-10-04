import { fileURLToPath } from "node:url";
import { FakeSystemUsageError, fsError } from "./errors.js";
import type { StoredNode } from "./fs-tree.js";
import { machine } from "./machine.js";

/**
 * `node:fs` / `node:fs/promises` over the fake machine's tree: exactly the
 * functions gup's sources import, with real error codes and the simulated
 * OS's path semantics. Writes land in the tree, so tests can assert on them.
 *
 * Injected faults apply to a path and everything below it: `missing` makes it
 * absent (ENOENT), `eacces` makes every access but `existsSync` fail with
 * EACCES — existence itself is visible without read permission.
 */

/** `fs.constants` access modes: the same values on every platform Node supports. */
const ACCESS_MODE = { F_OK: 0, X_OK: 1 } as const;

type PathArg = string | Buffer | URL;

interface EncodingOptions {
  readonly encoding?: BufferEncoding | null;
}

interface ReaddirFlags extends EncodingOptions {
  readonly withFileTypes?: boolean;
  readonly recursive?: boolean;
}

type EncodingArg = BufferEncoding | EncodingOptions | null | undefined;
type ReaddirOptions = BufferEncoding | ReaddirFlags | null | undefined;
type DirOptions = number | { readonly recursive?: boolean; readonly mode?: number } | undefined;

/** Undeclared paths of a permissive machine (§ platform simulation): exist, empty. */
const synthetic = new WeakSet<StoredNode>();

let tempCounter = 0;

function toPath(path: PathArg): string {
  if (path instanceof URL) return fileURLToPath(path, { windows: machine().platform === "win32" });
  return typeof path === "string" ? path : path.toString("utf8");
}

function checkFault(path: string, syscall: string): void {
  const state = machine();
  for (const fault of state.faults) {
    if (fault.on !== "fs" || !state.fs.isWithin(path, fault.path)) continue;
    throw fsError(fault.mode === "missing" ? "ENOENT" : "EACCES", syscall, path);
  }
}

function permissiveNode(path: string): StoredNode | undefined {
  const state = machine();
  if (!state.isPermissive) return undefined;
  const node: StoredNode = {
    kind: "dir",
    path: state.fs.normalize(path),
    content: Buffer.alloc(0),
    isExecutable: true,
    mtimeMs: 0,
  };
  synthetic.add(node);
  return node;
}

/** Trace a read, apply faults, and follow the path to its node. */
function lookup(path: PathArg, syscall: string): StoredNode {
  const text = toPath(path);
  machine().fsReads.push(text);
  checkFault(text, syscall);
  const node = machine().fs.resolve(text) ?? permissiveNode(text);
  if (!node) throw fsError("ENOENT", syscall, text);
  return node;
}

/** The existing directory a new entry at `path` goes into. */
function parentDir(path: string, syscall: string): StoredNode {
  const tree = machine().fs;
  const parent = tree.resolve(tree.dirname(path));
  if (!parent || parent.kind !== "dir") throw fsError("ENOENT", syscall, path);
  return parent;
}

function encodingOf(options: EncodingArg): BufferEncoding | undefined {
  if (typeof options === "string") return options;
  return options?.encoding ?? undefined;
}

function toBuffer(data: string | Uint8Array, options?: EncodingArg): Buffer {
  if (typeof data !== "string") return Buffer.from(data);
  return Buffer.from(data, encodingOf(options) ?? "utf8");
}

function unsupported(feature: string): never {
  const error = new FakeSystemUsageError(`the fake fs does not model ${feature}`);
  machine().unscripted.push(error);
  throw error;
}

class FakeStats {
  readonly size: number;
  readonly mode: number;
  readonly mtimeMs: number;
  readonly mtime: Date;

  constructor(private readonly node: StoredNode) {
    this.size = node.kind === "file" ? node.content.length : 0;
    this.mode = node.isExecutable ? 0o755 : 0o644;
    this.mtimeMs = node.mtimeMs;
    this.mtime = new Date(node.mtimeMs);
  }

  isFile(): boolean {
    return this.node.kind === "file";
  }

  isDirectory(): boolean {
    return this.node.kind === "dir";
  }

  isSymbolicLink(): boolean {
    return this.node.kind === "symlink";
  }
}

function writeNode(path: string, content: Buffer, syscall: string): void {
  checkFault(path, syscall);
  const tree = machine().fs;
  const parent = parentDir(path, syscall);
  const target = tree.join(parent.path, tree.basename(path));
  const existing = tree.get(target);
  if (existing?.kind === "dir") throw fsError("EISDIR", syscall, path);
  tree.add(target, { kind: "file", content, isExecutable: existing?.isExecutable ?? false });
}

function makeDirectory(path: string, options: DirOptions): string | undefined {
  const tree = machine().fs;
  checkFault(path, "mkdir");
  const isRecursive = typeof options === "object" && options.recursive === true;
  const existing = tree.resolve(path);
  if (existing) {
    if (isRecursive && existing.kind === "dir") return undefined;
    throw fsError("EEXIST", "mkdir", path);
  }
  if (!isRecursive) parentDir(path, "mkdir");
  const { missing, anchor } = missingAncestors(path);
  if (anchor.kind !== "dir") throw fsError("ENOTDIR", "mkdir", path);
  tree.add(path, { kind: "dir" });
  return isRecursive ? missing[0] : undefined;
}

interface AncestorChain {
  /** `path` and its missing ancestors, outermost first. */
  readonly missing: readonly string[];
  /** The closest ancestor that exists (roots always do). */
  readonly anchor: StoredNode;
}

function missingAncestors(path: string): AncestorChain {
  const tree = machine().fs;
  const missing: string[] = [];
  let current = tree.normalize(path);
  let anchor = tree.resolve(current);
  while (!anchor) {
    missing.unshift(current);
    current = tree.dirname(current);
    anchor = tree.resolve(current);
  }
  return { missing, anchor };
}

async function readFile(path: PathArg, options?: EncodingArg): Promise<string | Buffer> {
  const node = lookup(path, "open");
  if (node.kind === "dir" && !synthetic.has(node)) throw fsError("EISDIR", "read", toPath(path));
  const encoding = encodingOf(options);
  return encoding ? node.content.toString(encoding) : Buffer.from(node.content);
}

async function readdir(path: PathArg, options?: ReaddirOptions): Promise<string[]> {
  if (typeof options === "object" && (options?.withFileTypes || options?.recursive)) {
    unsupported("readdir withFileTypes / recursive");
  }
  const node = lookup(path, "scandir");
  if (node.kind !== "dir") throw fsError("ENOTDIR", "scandir", toPath(path));
  const tree = machine().fs;
  return tree.children(node).map((child) => tree.basename(child.path));
}

async function stat(path: PathArg): Promise<FakeStats> {
  return new FakeStats(lookup(path, "stat"));
}

/** Like `stat`, but a symlink in last position is reported as itself. */
async function lstat(path: PathArg): Promise<FakeStats> {
  const text = toPath(path);
  const tree = machine().fs;
  const parent = tree.resolve(tree.dirname(text));
  const own = parent && tree.get(tree.join(parent.path, tree.basename(text)));
  if (own?.kind !== "symlink") return new FakeStats(lookup(path, "lstat"));
  machine().fsReads.push(text);
  checkFault(text, "lstat");
  return new FakeStats(own);
}

async function realpath(path: PathArg): Promise<string> {
  return lookup(path, "realpath").path;
}

async function access(path: PathArg, mode: number = ACCESS_MODE.F_OK): Promise<void> {
  const node = lookup(path, "access");
  const needsExecBit = (mode & ACCESS_MODE.X_OK) !== 0 && machine().platform !== "win32";
  if (needsExecBit && node.kind === "file" && !node.isExecutable) {
    throw fsError("EACCES", "access", toPath(path));
  }
}

async function mkdtemp(prefix: string): Promise<string> {
  parentDir(prefix, "mkdtemp");
  let candidate: string;
  do {
    tempCounter += 1;
    candidate = `${prefix}${tempCounter.toString(36).padStart(6, "0")}`;
  } while (machine().fs.get(candidate));
  machine().fs.add(candidate, { kind: "dir" });
  return candidate;
}

async function writeFile(
  path: PathArg,
  data: string | Uint8Array,
  options?: EncodingArg,
): Promise<void> {
  writeNode(toPath(path), toBuffer(data, options), "open");
}

interface RmOptions {
  readonly recursive?: boolean;
  readonly force?: boolean;
}

async function rm(path: PathArg, options?: RmOptions): Promise<void> {
  const text = toPath(path);
  checkFault(text, "rm");
  const node = machine().fs.get(text);
  if (!node) {
    if (options?.force) return;
    throw fsError("ENOENT", "rm", text);
  }
  if (node.kind === "dir" && !options?.recursive) {
    const error = new Error(`Path is a directory: rm returned EISDIR (is a directory) ${text}`);
    throw Object.assign(error, { code: "ERR_FS_EISDIR" });
  }
  machine().fs.remove(text);
}

/** Only an empty directory, as `rmdir(2)`. */
async function rmdir(path: PathArg): Promise<void> {
  const text = toPath(path);
  checkFault(text, "rmdir");
  const tree = machine().fs;
  const node = tree.get(text);
  if (!node) throw fsError("ENOENT", "rmdir", text);
  if (node.kind !== "dir") throw fsError("ENOTDIR", "rmdir", text);
  if (tree.children(node).length > 0) throw fsError("ENOTEMPTY", "rmdir", text);
  tree.remove(text);
}

/**
 * Why `rename` may not replace `existing` with `source`, or null when it
 * does: a file replaces a file everywhere; on POSIX a directory replaces an
 * empty one; Windows refuses any directory in the move.
 */
function renameConflict(source: StoredNode, existing: StoredNode): string | null {
  if (source.kind !== "dir" && existing.kind !== "dir") return null;
  if (machine().platform === "win32") return "EPERM";
  if (existing.kind !== "dir") return "ENOTDIR";
  if (source.kind !== "dir") return "EISDIR";
  return machine().fs.children(existing).length === 0 ? null : "ENOTEMPTY";
}

/** A node and everything below it moves, symlinks as themselves. */
async function rename(from: PathArg, to: PathArg): Promise<void> {
  const [source, target] = [toPath(from), toPath(to)];
  checkFault(source, "rename");
  checkFault(target, "rename");
  const tree = machine().fs;
  const node = tree.get(source);
  if (!node) throw fsError("ENOENT", "rename", source);
  parentDir(target, "rename");
  const existing = tree.get(target);
  const conflict = existing ? renameConflict(node, existing) : null;
  if (conflict) throw fsError(conflict, "rename", target);
  if (existing) tree.remove(target);
  tree.move(source, target);
}

async function mkdir(path: PathArg, options?: DirOptions): Promise<string | undefined> {
  return makeDirectory(toPath(path), options);
}

async function copyFile(source: PathArg, destination: PathArg): Promise<void> {
  const node = lookup(source, "copyfile");
  if (node.kind !== "file") throw fsError("EISDIR", "copyfile", toPath(source));
  writeNode(toPath(destination), Buffer.from(node.content), "copyfile");
}

function existsSync(path: PathArg): boolean {
  try {
    lookup(path, "access");
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EACCES";
  }
}

function appendFileSync(path: PathArg, data: string | Uint8Array, options?: EncodingArg): void {
  const text = toPath(path);
  const existing = machine().fs.resolve(text);
  const previous = existing?.kind === "file" ? existing.content : Buffer.alloc(0);
  writeNode(text, Buffer.concat([previous, toBuffer(data, options)]), "open");
}

function mkdirSync(path: PathArg, options?: DirOptions): string | undefined {
  return makeDirectory(toPath(path), options);
}

export const fakeFsPromises = {
  readFile,
  readdir,
  stat,
  lstat,
  realpath,
  access,
  mkdtemp,
  writeFile,
  rm,
  rmdir,
  rename,
  mkdir,
  copyFile,
};

export const fakeFsSync = { existsSync, appendFileSync, mkdirSync };

/** Any other function of the module: a usage error instead of the real disk. */
export function unsupportedFsFunction(module: string, name: string): () => never {
  return () => unsupported(`${module}.${name}()`);
}
