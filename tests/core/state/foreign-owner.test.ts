import { describe, expect, it } from "vitest";
import {
  explainAccessError,
  foreignEntryHint,
  foreignEntryOf,
  type OwnershipContext,
} from "../../../src/core/state/foreign-owner.js";
import { useLocale } from "../../support/locale.js";

const ME = 501;
const ROOT = 0;
const HOME = "/Users/jane";
const SUPPORT = `${HOME}/Library/Application Support`;
const GUP = `${SUPPORT}/gup`;

/**
 * The machine gup 0.5.1 met: a run under sudo created `gup/` and its history
 * as root, inside folders that are the user's.
 */
function machine(owners: Readonly<Record<string, number>> = {}): Partial<OwnershipContext> {
  const tree: Record<string, number> = {
    [HOME]: ME,
    [`${HOME}/Library`]: ME,
    [SUPPORT]: ME,
    [GUP]: ROOT,
    [`${GUP}/history`]: ROOT,
    [`${GUP}/history/2026-08.jsonl`]: ROOT,
    ...owners,
  };
  return { uid: ME, home: HOME, user: "jane", ownerOf: (path) => tree[path] ?? null };
}

function accessError(path: string, code = "EACCES"): NodeJS.ErrnoException {
  return Object.assign(new Error(`${code}: permission denied, mkdir '${path}'`), { code, path });
}

describe("foreignEntryOf", () => {
  it("climbs from a missing path to the topmost folder root owns below home", () => {
    expect(foreignEntryOf(`${GUP}/locks`, machine())).toEqual({ path: GUP, uid: ROOT });
    expect(foreignEntryOf(`${GUP}/history/2026-10.jsonl`, machine())).toEqual({
      path: GUP,
      uid: ROOT,
    });
  });

  it("names the file alone when root owns only the file", () => {
    const owners = { [GUP]: ME, [`${GUP}/history`]: ME };
    expect(foreignEntryOf(`${GUP}/history/2026-08.jsonl`, machine(owners))).toEqual({
      path: `${GUP}/history/2026-08.jsonl`,
      uid: ROOT,
    });
  });

  it("finds nothing when the nearest entry is the user's own", () => {
    expect(foreignEntryOf(`${GUP}/locks`, machine({ [GUP]: ME }))).toBeNull();
  });

  it("never reports the home folder or anything outside it", () => {
    const onlyHome = (path: string) => (path === HOME ? ROOT : null);
    expect(foreignEntryOf(`${GUP}/locks`, { ...machine(), ownerOf: onlyHome })).toBeNull();
    expect(foreignEntryOf("/tmp/gup/locks", { ...machine(), ownerOf: () => ROOT })).toBeNull();
    expect(foreignEntryOf(`${HOME}/../bob/gup`, { ...machine(), ownerOf: () => ROOT })).toBeNull();
  });

  it("stops below a home folder root owns", () => {
    const owners = { [HOME]: ROOT, [`${HOME}/Library`]: ROOT, [SUPPORT]: ROOT };
    expect(foreignEntryOf(`${GUP}/locks`, machine(owners))).toEqual({
      path: `${HOME}/Library`,
      uid: ROOT,
    });
  });

  it("checks nothing on Windows, where a process has no uid", () => {
    expect(foreignEntryOf(`${GUP}/locks`, { ...machine(), uid: undefined })).toBeNull();
  });
});

describe("foreignEntryHint", () => {
  useLocale("en");

  it("names the owner and the chown that gives the entry back, through $HOME", () => {
    expect(foreignEntryHint({ path: GUP, uid: ROOT }, machine())).toBe(
      `${GUP} belongs to root, not to you — gup was probably run with sudo. ` +
        'Give it back to your user: sudo chown -R jane "$HOME/Library/Application Support/gup"',
    );
  });

  it("names another user by uid and escapes what double quotes still read", () => {
    const hint = foreignEntryHint({ path: `${HOME}/a"$b\`c\\d`, uid: 502 }, machine());
    expect(hint).toContain("belongs to uid 502");
    expect(hint).toContain('sudo chown -R jane "$HOME/a\\"\\$b\\`c\\\\d"');
  });
});

describe("explainAccessError", () => {
  useLocale("en");

  it("turns EACCES on a folder root owns into the fix, keeping the error as its cause", () => {
    const error = accessError(`${GUP}/locks`);
    const explained = explainAccessError(error, "/unused", machine());
    expect(explained).toBeInstanceOf(Error);
    expect((explained as Error).message).toBe(
      `cannot write ${GUP}/locks: ${foreignEntryHint({ path: GUP, uid: ROOT }, machine())}`,
    );
    expect((explained as Error).cause).toBe(error);
  });

  it("falls back on the given path when the error names none", () => {
    const error = Object.assign(new Error("listen EACCES"), { code: "EACCES" });
    const explained = explainAccessError(error, `${GUP}/locks`, machine());
    expect((explained as Error).message).toMatch(/^cannot write .+\/gup\/locks: /);
  });

  it("explains EPERM as well", () => {
    const explained = explainAccessError(accessError(`${GUP}/locks`, "EPERM"), GUP, machine());
    expect((explained as Error).message).toContain(
      'sudo chown -R jane "$HOME/Library/Application Support/gup"',
    );
  });

  it("leaves every other error as it is", () => {
    const own = accessError(`${GUP}/locks`);
    expect(explainAccessError(own, GUP, machine({ [GUP]: ME }))).toBe(own);
    const full = Object.assign(new Error("no space"), { code: "ENOSPC", path: `${GUP}/locks` });
    expect(explainAccessError(full, GUP, machine())).toBe(full);
    expect(explainAccessError("not an error", GUP, machine())).toBe("not an error");
  });
});
