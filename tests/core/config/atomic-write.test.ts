import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NODE_FILE_OPS, writeFileAtomic, type FileOps } from "../../../src/core/config/atomic-write.js";
import { useTempDirs } from "../../support/temp-dirs.js";

const tempDir = useTempDirs();

let dir: string;
let target: string;

beforeEach(async () => {
  dir = await tempDir("gup-atomic-");
  target = join(dir, "config.json");
  await writeFile(target, "old\n", "utf8");
});

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

/** Real file operations, with rename failing `code` for the first `times` calls. */
function renameFailing(code: string, times: number): FileOps & { renameSync: ReturnType<typeof vi.fn> } {
  let failures = 0;
  const renameSync = vi.fn((from: string, to: string) => {
    if (failures++ < times) throw errno(code);
    NODE_FILE_OPS.renameSync(from, to);
  });
  return { ...NODE_FILE_OPS, renameSync } as FileOps & { renameSync: ReturnType<typeof vi.fn> };
}

describe("writeFileAtomic", () => {
  it("replaces the file and leaves no temp file behind", async () => {
    writeFileAtomic(target, "new\n");
    expect(await readFile(target, "utf8")).toBe("new\n");
    expect(await readdir(dir)).toEqual(["config.json"]);
  });

  it("retries a rename the OS refuses for a moment (antivirus, indexer)", async () => {
    const ops = renameFailing("EPERM", 2);
    writeFileAtomic(target, "new\n", ops);
    expect(ops.renameSync).toHaveBeenCalledTimes(3);
    expect(await readFile(target, "utf8")).toBe("new\n");
  });

  it("gives up after its retries, keeps the old file and removes the temp file", async () => {
    const ops = renameFailing("EBUSY", Number.POSITIVE_INFINITY);
    expect(() => writeFileAtomic(target, "new\n", ops)).toThrow("EBUSY");
    expect(await readFile(target, "utf8")).toBe("old\n");
    expect(await readdir(dir)).toEqual(["config.json"]);
  });

  it("does not retry an error that waiting cannot fix", () => {
    const ops = renameFailing("ENOSPC", 1);
    expect(() => writeFileAtomic(target, "new\n", ops)).toThrow("ENOSPC");
    expect(ops.renameSync).toHaveBeenCalledTimes(1);
  });
});
