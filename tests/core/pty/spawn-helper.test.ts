import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * macOS's `spawn-helper` exec bit. The file-system calls keep their real
 * behaviour unless a test scripts them: Windows cannot express a missing exec
 * bit, so the decision branches are scripted, and the real round trip runs on
 * POSIX only.
 */
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    access: vi.fn(actual.access),
    chmod: vi.fn(actual.chmod),
    stat: vi.fn(actual.stat),
  };
});

import { access, chmod, mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { ensureSpawnHelper } from "../../../src/core/pty/spawn-helper.js";

const PACKAGE = join("/opt", "node_modules", "node-pty");
const HELPER = join(PACKAGE, "prebuilds", "darwin-arm64", "spawn-helper");
const HOST = { arch: "arm64", uid: 501 };
const denied = Object.assign(new Error("EACCES"), { code: "EACCES" });
const missing = Object.assign(new Error("ENOENT"), { code: "ENOENT" });

function ownedBy(uid: number): Awaited<ReturnType<typeof stat>> {
  return { uid } as Awaited<ReturnType<typeof stat>>;
}

describe("ensureSpawnHelper", () => {
  it("leaves an executable helper alone", async () => {
    vi.mocked(access).mockResolvedValueOnce(undefined);
    await expect(ensureSpawnHelper(PACKAGE, HOST)).resolves.toBeNull();
    expect(access).toHaveBeenCalledWith(HELPER, expect.any(Number));
    expect(chmod).not.toHaveBeenCalled();
  });

  it("has nothing to fix when this architecture has no prebuilt helper", async () => {
    vi.mocked(access).mockRejectedValueOnce(missing);
    vi.mocked(stat).mockRejectedValueOnce(missing);
    await expect(ensureSpawnHelper(PACKAGE, HOST)).resolves.toBeNull();
    expect(chmod).not.toHaveBeenCalled();
  });

  it("makes the user's own helper executable", async () => {
    vi.mocked(access).mockRejectedValueOnce(denied).mockResolvedValueOnce(undefined);
    vi.mocked(stat).mockResolvedValueOnce(ownedBy(501));
    vi.mocked(chmod).mockResolvedValueOnce(undefined);
    await expect(ensureSpawnHelper(PACKAGE, HOST)).resolves.toBeNull();
    expect(chmod).toHaveBeenCalledExactlyOnceWith(HELPER, 0o755);
  });

  it("names the helper when chmod did not help", async () => {
    vi.mocked(access).mockRejectedValueOnce(denied).mockRejectedValueOnce(denied);
    vi.mocked(stat).mockResolvedValueOnce(ownedBy(501));
    vi.mocked(chmod).mockRejectedValueOnce(denied);
    await expect(ensureSpawnHelper(PACKAGE, HOST)).resolves.toBe(HELPER);
  });

  it("never changes a file owned by someone else, and names it", async () => {
    vi.mocked(access).mockRejectedValueOnce(denied);
    vi.mocked(stat).mockResolvedValueOnce(ownedBy(0));
    await expect(ensureSpawnHelper(PACKAGE, HOST)).resolves.toBe(HELPER);
    expect(chmod).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform === "win32")("restores the exec bit of a 0644 helper", async () => {
    const dir = await mkdtemp(join(tmpdir(), "gup-spawn-helper-"));
    try {
      const helper = join(dir, "prebuilds", `darwin-${process.arch}`, "spawn-helper");
      await mkdir(join(helper, ".."), { recursive: true });
      await writeFile(helper, "#!/bin/sh\n", "utf8");
      await chmod(helper, 0o644);

      const host = { arch: process.arch, uid: process.getuid?.() };
      await expect(ensureSpawnHelper(dir, host)).resolves.toBeNull();
      expect((await stat(helper)).mode & 0o777).toBe(0o755);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
