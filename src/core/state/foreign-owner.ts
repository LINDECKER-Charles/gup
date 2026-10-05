import { lstatSync, readdirSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { posix } from "node:path";

import { localized } from "../i18n/localized.js";

/**
 * gup's files that belong to another user, and how to give them back.
 *
 * macOS's `sudo` keeps the invoking user's HOME: a gup run with sudo wrote its
 * history, log and update lock as root into that user's folders, and every
 * later run as the user failed on a bare EACCES — the history went unwritten,
 * the update lock could not be created and no update started. The error alone
 * names neither the culprit nor the fix; this module finds the entry the
 * other user owns and spells out the `chown` that gives it back.
 *
 * POSIX only: on Windows an elevated process keeps the user's profile and its
 * files stay writable, so there is nothing to look for.
 */

const { dirname, isAbsolute, join, relative, sep } = posix;
const ROOT_UID = 0;
/** What a write into an entry owned by another user fails with. */
const ACCESS_CODES: ReadonlySet<string> = new Set(["EACCES", "EPERM"]);
/** The account name when the system cannot give one: the shell asks. */
const USER_FALLBACK = "$(id -un)";
/** What a shell still reads inside double quotes. */
const DOUBLE_QUOTED_SPECIALS = /["$`\\]/g;

const OWNERSHIP_LABELS = localized({
  en: {
    foreign: (path: string, owner: string, fix: string) =>
      `${path} belongs to ${owner}, not to you — gup was probably run with sudo. ` +
      `Give it back to your user: ${fix}`,
    cannotWrite: (path: string, hint: string) => `cannot write ${path}: ${hint}`,
  },
  fr: {
    foreign: (path, owner, fix) =>
      `${path} appartient à ${owner}, pas à vous — gup a sans doute été lancé avec sudo. ` +
      `Rendez-le à votre utilisateur : ${fix}`,
    cannotWrite: (path, hint) => `impossible d'écrire ${path} : ${hint}`,
  },
});

export interface ForeignEntry {
  /** The topmost entry that user owns: giving it back fixes everything below it. */
  readonly path: string;
  readonly uid: number;
}

/** What ownership is checked against; every field defaults to the running process. */
export interface OwnershipContext {
  /** This process's uid; undefined on Windows, where nothing is checked. */
  readonly uid: number | undefined;
  /** Nothing at or above the home folder is reported: it is not gup's to give back. */
  readonly home: string;
  /** The uid that owns `path`, or null when nothing can be read there. */
  readonly ownerOf: (path: string) => number | null;
  /** The account the fix gives the entry back to. */
  readonly user: string;
}

/**
 * The entry at or above `path`, inside the home folder, that another user
 * owns — climbed up to the topmost one that user owns — or null when the
 * nearest existing entry is this user's.
 */
export function foreignEntryOf(
  path: string,
  context: Partial<OwnershipContext> = {},
): ForeignEntry | null {
  const ctx = resolveContext(context);
  if (ctx.uid === undefined) return null;
  const nearest = nearestEntry(path, ctx);
  if (nearest === null || nearest.uid === ctx.uid) return null;
  return topmostOwnedBy(nearest, ctx);
}

/**
 * Every foreign entry among `dirs` and their direct children, once each:
 * where a run under sudo leaves its files (a history month, a day's log).
 */
export function foreignEntriesIn(
  dirs: readonly string[],
  context: Partial<OwnershipContext> = {},
): ForeignEntry[] {
  const ctx = resolveContext(context);
  const found = new Map<string, ForeignEntry>();
  for (const path of dirs.flatMap((dir) => [dir, ...childrenOf(dir)])) {
    const entry = foreignEntryOf(path, ctx);
    if (entry !== null) found.set(entry.path, entry);
  }
  return [...found.values()];
}

/** What to tell the user about `entry`: who owns it and the command that gives it back. */
export function foreignEntryHint(
  entry: ForeignEntry,
  context: Partial<OwnershipContext> = {},
): string {
  const ctx = resolveContext(context);
  return OWNERSHIP_LABELS.foreign(entry.path, ownerName(entry.uid), chownCommand(entry.path, ctx));
}

/**
 * `error` with its fix when it is an access error on an entry another user
 * owns, `error` itself otherwise. `path` stands in when the error names none
 * (a socket that could not listen).
 */
export function explainAccessError(
  error: unknown,
  path: string,
  context: Partial<OwnershipContext> = {},
): unknown {
  if (!isAccessError(error)) return error;
  const ctx = resolveContext(context);
  const failing = error.path ?? path;
  const entry = foreignEntryOf(failing, ctx);
  if (entry === null) return error;
  const message = OWNERSHIP_LABELS.cannotWrite(failing, foreignEntryHint(entry, ctx));
  return new Error(message, { cause: error });
}

function isAccessError(error: unknown): error is NodeJS.ErrnoException {
  const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;
  return code !== undefined && ACCESS_CODES.has(code);
}

/** The first entry that exists, from `path` up — an unreadable one counts as missing. */
function nearestEntry(path: string, ctx: OwnershipContext): ForeignEntry | null {
  for (let current = path; isBelow(ctx.home, current); current = dirname(current)) {
    const uid = ctx.ownerOf(current);
    if (uid !== null) return { path: current, uid };
  }
  return null;
}

function topmostOwnedBy(entry: ForeignEntry, ctx: OwnershipContext): ForeignEntry {
  let top = entry;
  let parent = dirname(top.path);
  while (isBelow(ctx.home, parent) && ctx.ownerOf(parent) === entry.uid) {
    top = { path: parent, uid: entry.uid };
    parent = dirname(parent);
  }
  return top;
}

/** Strictly inside `home`: the home folder itself is never gup's. */
function isBelow(home: string, path: string): boolean {
  if (home === "") return false;
  const rel = relative(home, path);
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/**
 * `sudo chown -R jane "$HOME/Library/Application Support/gup"`: through
 * `$HOME`, so the line stays short and copies as is; the rest is escaped for
 * the double quotes.
 */
function chownCommand(path: string, ctx: OwnershipContext): string {
  const quoted = relative(ctx.home, path).replace(DOUBLE_QUOTED_SPECIALS, "\\$&");
  return `sudo chown -R ${ctx.user} "$HOME/${quoted}"`;
}

function ownerName(uid: number): string {
  return uid === ROOT_UID ? "root" : `uid ${uid}`;
}

function childrenOf(dir: string): string[] {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- read-only listing of one of gup's own state folders, from app-dirs
    return readdirSync(dir).map((name) => join(dir, name));
  } catch {
    return [];
  }
}

function resolveContext(context: Partial<OwnershipContext>): OwnershipContext {
  return {
    uid: "uid" in context ? context.uid : process.getuid?.(),
    home: context.home ?? homeOf(),
    ownerOf: context.ownerOf ?? ownerOnDisk,
    user: context.user ?? userOf(),
  };
}

function ownerOnDisk(path: string): number | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- read-only owner probe of a gup state path or one of its parents inside home
    return lstatSync(path).uid;
  } catch {
    return null;
  }
}

function homeOf(): string {
  try {
    return homedir();
  } catch {
    return process.env["HOME"] ?? "";
  }
}

function userOf(): string {
  try {
    return userInfo().username || USER_FALLBACK;
  } catch {
    return USER_FALLBACK;
  }
}
