import { existsSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** How many of the next lock creations fail with EPERM (Windows: a file being deleted). */
const refusals = vi.hoisted(() => ({ left: 0 }));
vi.mock("node:fs", async (importOriginal) => {
  const real = await importOriginal<typeof import("node:fs")>();
  return {
    ...real,
    openSync: (...args: Parameters<typeof real.openSync>) => {
      if (refusals.left > 0) {
        refusals.left--;
        throw Object.assign(new Error("EPERM: operation not permitted, open"), { code: "EPERM" });
      }
      return real.openSync(...args);
    },
  };
});

import {
  FileLockTimeoutError,
  LOCK_STALE_MS,
  withFileLock,
} from "../../../src/core/state/file-lock.js";
import { restorePlatform, setPlatform } from "../../support/platform.js";
import { useTempDirs } from "../../support/temp-dirs.js";

const tempDir = useTempDirs();

let file: string;

beforeEach(async () => {
  file = join(await tempDir("gup-lock-"), "state.json");
});

describe("withFileLock", () => {
  it("holds <file>.lock during the work and removes it afterwards", () => {
    const seen = withFileLock(file, () => existsSync(`${file}.lock`));
    expect(seen).toBe(true);
    expect(existsSync(`${file}.lock`)).toBe(false);
  });

  it("releases the lock when the work throws", () => {
    expect(() =>
      withFileLock(file, () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(existsSync(`${file}.lock`)).toBe(false);
  });

  it("takes over a lock left behind by a process that died", () => {
    writeFileSync(`${file}.lock`, "4242");
    const past = (Date.now() - 2 * LOCK_STALE_MS) / 1000;
    utimesSync(`${file}.lock`, past, past);
    expect(withFileLock(file, () => "ran")).toBe("ran");
  });

  // The lock waits about 2.7 s before giving up; leave room on a busy machine.
  const GIVE_UP_BUDGET_MS = 15_000;

  it("gives up on a lock that a live process keeps", () => {
    writeFileSync(`${file}.lock`, "4242");
    expect(() => withFileLock(file, () => "never")).toThrow(FileLockTimeoutError);
    expect(existsSync(`${file}.lock`)).toBe(true);
  }, GIVE_UP_BUDGET_MS);

  describe("on Windows, while a peer deletes its lock file", () => {
    beforeEach(() => setPlatform("win32"));
    afterEach(() => {
      refusals.left = 0;
      restorePlatform();
    });

    it("waits for the file to go, as for a held lock, instead of failing the save", () => {
      refusals.left = 2;
      expect(withFileLock(file, () => "ran")).toBe("ran");
      expect(refusals.left).toBe(0);
    });

    it("hands over EPERM itself when it never stops: a permission problem, not a busy lock", () => {
      refusals.left = Number.POSITIVE_INFINITY;
      expect(() => withFileLock(file, () => "never")).toThrow(
        expect.objectContaining({ code: "EPERM" }),
      );
    }, GIVE_UP_BUDGET_MS);
  });

  it("fails at once on EPERM elsewhere than Windows", () => {
    setPlatform("linux");
    refusals.left = 1;
    try {
      expect(() => withFileLock(file, () => "never")).toThrow(
        expect.objectContaining({ code: "EPERM" }),
      );
      expect(refusals.left).toBe(0);
    } finally {
      refusals.left = 0;
      restorePlatform();
    }
  });
});
