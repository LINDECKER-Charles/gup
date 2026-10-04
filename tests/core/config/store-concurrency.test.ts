import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { useTempDirs } from "../../support/temp-dirs.js";

/**
 * Two real processes saving the same file at the same time: the menu in one
 * terminal and a `gup schedule` command in another. Every update must land —
 * none may be lost to a read-modify-write race — and neither process may
 * destroy the other's section.
 */
const run = promisify(execFile);
const WRITER = join(import.meta.dirname, "concurrent-writer.ts");
const ROUNDS = 25;
const SPAWN_TIMEOUT_MS = 60_000;
const tempDir = useTempDirs();

function writer(file: string, key: string): Promise<unknown> {
  return run(process.execPath, ["--import", "tsx", WRITER, file, key, String(ROUNDS)]);
}

describe("ConfigStore across processes", () => {
  it("loses no update when two processes edit the same section", async () => {
    const file = join(await tempDir("gup-config-race-"), "config.json");
    await Promise.all([writer(file, "counter"), writer(file, "counter")]);
    const document = JSON.parse(await readFile(file, "utf8"));
    expect(document.sections.counter.count).toBe(2 * ROUNDS);
  }, SPAWN_TIMEOUT_MS);

  it("keeps both sections when two processes edit different ones", async () => {
    const file = join(await tempDir("gup-config-race-"), "config.json");
    await Promise.all([writer(file, "left"), writer(file, "right")]);
    const document = JSON.parse(await readFile(file, "utf8"));
    expect(document.sections.left.count).toBe(ROUNDS);
    expect(document.sections.right.count).toBe(ROUNDS);
  }, SPAWN_TIMEOUT_MS);
});
