import { posix, win32 } from "node:path";
import { fsError } from "./errors.js";
import type { SimPlatform } from "./types.js";

/**
 * The fake machine's file tree, with the path semantics of the simulated OS:
 *
 * - win32: case-insensitive, `\` and `/` both accepted (keys are lower-cased
 *   `path.win32.normalize` output);
 * - POSIX: case-sensitive, `/` only — a backslash is an ordinary character.
 *
 * So a provider that builds a darwin path with the host `join` on a Windows
 * host misses, exactly as it would on a real Mac.
 */

export type NodeKind = "file" | "dir" | "symlink";

export interface StoredNode {
  readonly kind: NodeKind;
  /** The normalised path in its declared case: what `readdir`/`realpath` report. */
  readonly path: string;
  content: Buffer;
  readonly target?: string;
  readonly isExecutable: boolean;
  mtimeMs: number;
}

export interface NodeInit {
  readonly kind: NodeKind;
  readonly content?: Buffer;
  readonly target?: string;
  readonly isExecutable?: boolean;
}

/** Symlink hops before giving up, as Linux's MAXSYMLINKS. */
const MAX_SYMLINK_HOPS = 40;

/** A stable mtime: tests must not depend on the wall clock. */
const FIXED_MTIME_MS = Date.UTC(2026, 0, 1);

type WalkStep =
  | { readonly kind: "found"; readonly node: StoredNode }
  | { readonly kind: "missing" }
  | { readonly kind: "link"; readonly rewritten: string };

export class FsTree {
  private readonly nodes = new Map<string, StoredNode>();
  private readonly flavour: typeof win32 | typeof posix;

  constructor(private readonly platform: SimPlatform) {
    this.flavour = platform === "win32" ? win32 : posix;
  }

  /** Normalised path in the simulated flavour, without a trailing separator. */
  normalize(path: string): string {
    const normalized = this.flavour.normalize(path);
    const { root } = this.flavour.parse(normalized);
    const isBareRoot = normalized === root;
    return isBareRoot ? normalized : normalized.replace(/[\\/]+$/, "");
  }

  join(...segments: readonly string[]): string {
    return this.normalize(this.flavour.join(...segments));
  }

  dirname(path: string): string {
    return this.flavour.dirname(this.normalize(path));
  }

  basename(path: string): string {
    return this.flavour.basename(this.normalize(path));
  }

  private key(path: string): string {
    const normalized = this.normalize(path);
    return this.platform === "win32" ? normalized.toLowerCase() : normalized;
  }

  /** True when `path` is `ancestor` or lies below it. */
  isWithin(path: string, ancestor: string): boolean {
    const key = this.key(path);
    const prefix = this.key(ancestor);
    if (key === prefix) return true;
    const sep = this.flavour.sep;
    return key.startsWith(prefix.endsWith(sep) ? prefix : `${prefix}${sep}`);
  }

  private isRoot(path: string): boolean {
    const normalized = this.normalize(path);
    return normalized.length > 0 && normalized === this.flavour.parse(normalized).root;
  }

  private rootNode(path: string): StoredNode {
    return {
      kind: "dir",
      path: this.normalize(path),
      content: Buffer.alloc(0),
      isExecutable: true,
      mtimeMs: FIXED_MTIME_MS,
    };
  }

  /**
   * The node stored at `path` itself, symlinks not followed. Roots always
   * exist; relative paths never do (nothing in the fake has a working directory).
   */
  get(path: string): StoredNode | undefined {
    if (!this.flavour.isAbsolute(path)) return undefined;
    if (this.isRoot(path)) return this.rootNode(path);
    return this.nodes.get(this.key(path));
  }

  /** Store a node, creating every missing ancestor as a directory. */
  add(path: string, init: NodeInit): StoredNode {
    if (!this.flavour.isAbsolute(path)) {
      throw new Error(`fake fs paths are absolute ${this.platform} paths, got "${path}"`);
    }
    const normalized = this.normalize(path);
    const parent = this.flavour.dirname(normalized);
    if (parent !== normalized && !this.get(parent)) this.add(parent, { kind: "dir" });
    const node: StoredNode = {
      kind: init.kind,
      path: normalized,
      content: init.content ?? Buffer.alloc(0),
      isExecutable: init.isExecutable ?? init.kind === "dir",
      mtimeMs: FIXED_MTIME_MS,
      ...(init.target !== undefined && { target: init.target }),
    };
    this.nodes.set(this.key(normalized), node);
    return node;
  }

  /** Remove a node and everything below it. */
  remove(path: string): void {
    for (const [key, node] of this.nodes) {
      if (this.isWithin(node.path, path)) this.nodes.delete(key);
    }
  }

  /** Direct children of a directory, sorted by name. */
  children(dir: StoredNode): readonly StoredNode[] {
    const dirKey = this.key(dir.path);
    const isChild = (node: StoredNode): boolean =>
      node.path !== dir.path && this.key(this.flavour.dirname(node.path)) === dirKey;
    return [...this.nodes.values()].filter(isChild).sort((a, b) => (a.path < b.path ? -1 : 1));
  }

  /**
   * The node `path` designates once every symlink on the way is followed (the
   * `realpath` walk), or undefined when a component is missing. A relative
   * symlink target is resolved against the link's own directory.
   */
  resolve(path: string): StoredNode | undefined {
    let pending = this.normalize(path);
    for (let hop = 0; hop <= MAX_SYMLINK_HOPS; hop++) {
      const step = this.walk(pending);
      if (step.kind === "found") return step.node;
      if (step.kind === "missing") return undefined;
      pending = step.rewritten;
    }
    throw fsError("ELOOP", "realpath", path);
  }

  private walk(path: string): WalkStep {
    const { root } = this.flavour.parse(path);
    if (root.length === 0) return { kind: "missing" };
    const segments = path.slice(root.length).split(this.flavour.sep).filter(Boolean);
    let current = root;
    for (const [index, segment] of segments.entries()) {
      current = this.flavour.join(current, segment);
      const node = this.nodes.get(this.key(current));
      if (!node) return { kind: "missing" };
      if (node.kind === "symlink") return this.follow(node, segments.slice(index + 1));
      if (node.kind === "file" && index < segments.length - 1) return { kind: "missing" };
    }
    const found = this.get(current);
    return found ? { kind: "found", node: found } : { kind: "missing" };
  }

  private follow(link: StoredNode, rest: readonly string[]): WalkStep {
    const target = link.target ?? "";
    const base = this.flavour.isAbsolute(target)
      ? target
      : this.flavour.join(this.flavour.dirname(link.path), target);
    return { kind: "link", rewritten: this.normalize(this.flavour.join(base, ...rest)) };
  }
}
