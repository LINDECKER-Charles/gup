import { existsSync, utimesSync, writeFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  FileLockTimeoutError,
  LOCK_STALE_MS,
  withFileLock,
} from "../../../src/core/state/file-lock.js";

let file: string;

beforeEach(async () => {
  file = join(await mkdtemp(join(tmpdir(), "gup-lock-")), "state.json");
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
});
