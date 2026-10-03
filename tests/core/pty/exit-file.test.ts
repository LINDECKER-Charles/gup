import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createExitFileSlot,
  EXIT_POLL_MS,
  readExitFile,
  watchExitFile,
  writeExitFile,
} from "../../../src/core/pty/exit-file.js";

/**
 * The Windows fast path's file: written atomically by the trampoline, read
 * strictly by the parent — anything but one integer and a newline is no
 * answer yet.
 */

const run = promisify(execFile);
const SPAWN_TIMEOUT_MS = 60_000;
const EXIT_FILE_MODULE = pathToFileURL(join(process.cwd(), "src", "core", "pty", "exit-file.ts"));
/**
 * A process that opens a slot, prints its path and exits without releasing
 * it — the way gup leaves on a signal while an install runs.
 */
const OPEN_THEN_EXIT = [
  `const { createExitFileSlot } = await import(${JSON.stringify(EXIT_FILE_MODULE.href)});`,
  "process.stdout.write(createExitFileSlot().path, () => process.exit(0));",
].join("\n");

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "gup-exit-file-"));
});

afterEach(async () => {
  vi.useRealTimers();
  await rm(dir, { recursive: true, force: true });
});

describe("exit file", () => {
  it.each([0, 3010, -1, -1073741510])("round-trips exit code %i", async (code) => {
    const path = join(dir, "a.exit");
    writeExitFile(path, code);
    await expect(readExitFile(path)).resolves.toBe(code);
  });

  it("leaves no temporary file behind once written", async () => {
    writeExitFile(join(dir, "a.exit"), 7);
    expect(await readdir(dir)).toEqual(["a.exit"]);
  });

  it("never writes through a temporary file someone staged first", async () => {
    const path = join(dir, "a.exit");
    await writeFile(`${path}.tmp`, "0\n", "utf8");
    expect(() => writeExitFile(path, 5)).toThrow();
    await expect(readExitFile(path)).resolves.toBeNull();
  });

  it("reads a missing file as no answer yet", async () => {
    await expect(readExitFile(join(dir, "missing.exit"))).resolves.toBeNull();
  });

  it.each([
    ["no newline", "0"],
    ["two newlines", "0\n\n"],
    ["a word", "zero\n"],
    ["leading space", " 0\n"],
    ["a decimal", "1.5\n"],
    ["eleven digits", "12345678901\n"],
    ["an empty file", ""],
  ])("refuses %s", async (_label, content) => {
    const path = join(dir, "bad.exit");
    await writeFile(path, content, "utf8");
    await expect(readExitFile(path)).resolves.toBeNull();
  });
});

describe("createExitFileSlot", () => {
  it("names a random file in a fresh private directory, removed on release", async () => {
    const first = createExitFileSlot();
    const second = createExitFileSlot();
    try {
      expect(basename(dirname(first.path))).toMatch(/^gup-pty-/);
      expect(basename(first.path)).toMatch(/^[0-9a-f]{16}\.exit$/);
      expect(dirname(first.path)).not.toBe(dirname(second.path));
      expect(existsSync(dirname(first.path))).toBe(true);
    } finally {
      await first.release();
      await second.release();
    }
    expect(existsSync(dirname(first.path))).toBe(false);
  });

  it(
    "leaves nothing in the temp dir when the process exits with a slot still open",
    async () => {
      const args = ["--import", "tsx", "--input-type=module", "-e", OPEN_THEN_EXIT];
      const { stdout } = await run(process.execPath, args);
      expect(basename(dirname(stdout))).toMatch(/^gup-pty-/);
      expect(existsSync(dirname(stdout))).toBe(false);
    },
    SPAWN_TIMEOUT_MS,
  );
});

describe("watchExitFile", () => {
  it("hands over the first valid code once, then stops polling", async () => {
    vi.useFakeTimers();
    const path = join(dir, "a.exit");
    const onCode = vi.fn();
    watchExitFile(path, onCode);

    await vi.advanceTimersByTimeAsync(EXIT_POLL_MS * 3);
    expect(onCode).not.toHaveBeenCalled();

    writeExitFile(path, 3010);
    await vi.waitFor(async () => {
      await vi.advanceTimersByTimeAsync(EXIT_POLL_MS);
      expect(onCode).toHaveBeenCalledWith(3010);
    });
    await vi.advanceTimersByTimeAsync(EXIT_POLL_MS * 5);
    expect(onCode).toHaveBeenCalledTimes(1);
  });

  it("stops for good when the caller learnt the exit another way", async () => {
    vi.useFakeTimers();
    const path = join(dir, "a.exit");
    const onCode = vi.fn();
    const stop = watchExitFile(path, onCode);
    stop();
    writeExitFile(path, 0);
    await vi.advanceTimersByTimeAsync(EXIT_POLL_MS * 5);
    expect(onCode).not.toHaveBeenCalled();
  });
});
