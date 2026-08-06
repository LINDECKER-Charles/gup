import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * isCorepackShim resolves PATH twice (corepack + the queried binary) and
 * compares their parent directories. We mock whichFirst to exercise each
 * branch without touching the filesystem.
 *
 * The comparison is platform-dependent — case-insensitive win32 dirnames on
 * Windows, case-sensitive POSIX dirnames elsewhere — so these tests pin
 * `process.platform` explicitly instead of inheriting the runner's.
 */
const { whichFirstMock } = vi.hoisted(() => ({ whichFirstMock: vi.fn() }));

vi.mock("../../src/core/runner.js", () => ({
  whichFirst: whichFirstMock,
}));

import { isCorepackShim } from "../../src/core/corepack-ownership.js";

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value, configurable: true });
}

beforeEach(() => {
  whichFirstMock.mockReset();
});

afterEach(() => {
  setPlatform(ORIGINAL_PLATFORM);
});

describe("isCorepackShim on Windows", () => {
  beforeEach(() => {
    setPlatform("win32");
  });

  it("returns true when corepack and the binary share the same dir", async () => {
    whichFirstMock.mockImplementation(async (bin: string) =>
      bin === "corepack"
        ? "C:\\Program Files\\nodejs\\corepack.cmd"
        : "C:\\Program Files\\nodejs\\pnpm.cmd",
    );
    await expect(isCorepackShim("pnpm")).resolves.toBe(true);
  });

  it("compares case-insensitively", async () => {
    whichFirstMock.mockImplementation(async (bin: string) =>
      bin === "corepack"
        ? "C:\\PROGRAM Files\\NodeJs\\corepack.cmd"
        : "C:\\program files\\nodejs\\yarn.cmd",
    );
    await expect(isCorepackShim("yarn")).resolves.toBe(true);
  });

  it("returns false when the binary lives in a different dir than corepack", async () => {
    whichFirstMock.mockImplementation(async (bin: string) =>
      bin === "corepack"
        ? "C:\\Program Files\\nodejs\\corepack.cmd"
        : "C:\\Users\\me\\AppData\\Local\\pnpm\\pnpm.cmd",
    );
    await expect(isCorepackShim("pnpm")).resolves.toBe(false);
  });

  it("returns false when corepack is not on PATH", async () => {
    whichFirstMock.mockImplementation(async (bin: string) =>
      bin === "corepack" ? null : "C:\\Tools\\pnpm.cmd",
    );
    await expect(isCorepackShim("pnpm")).resolves.toBe(false);
  });

  it("returns false when the queried binary is not on PATH", async () => {
    whichFirstMock.mockImplementation(async (bin: string) =>
      bin === "corepack" ? "C:\\Program Files\\nodejs\\corepack.cmd" : null,
    );
    await expect(isCorepackShim("pnpm")).resolves.toBe(false);
  });

  it("returns false when both lookups fail", async () => {
    whichFirstMock.mockResolvedValue(null);
    await expect(isCorepackShim("pnpm")).resolves.toBe(false);
  });

  it("runs both PATH probes in parallel (single whichFirst call per binary)", async () => {
    whichFirstMock.mockResolvedValue("/usr/bin/x");
    await isCorepackShim("yarn");
    expect(whichFirstMock).toHaveBeenCalledTimes(2);
    const args = whichFirstMock.mock.calls.map((c) => c[0]);
    expect(args).toEqual(expect.arrayContaining(["corepack", "yarn"]));
  });
});

describe("isCorepackShim on POSIX", () => {
  beforeEach(() => {
    setPlatform("darwin");
  });

  it("recognises a shim living next to corepack", async () => {
    whichFirstMock.mockImplementation(async (bin: string) =>
      bin === "corepack"
        ? "/opt/homebrew/bin/corepack"
        : "/opt/homebrew/bin/pnpm",
    );
    await expect(isCorepackShim("pnpm")).resolves.toBe(true);
  });

  it("returns false for a standalone install elsewhere on PATH", async () => {
    whichFirstMock.mockImplementation(async (bin: string) =>
      bin === "corepack"
        ? "/opt/homebrew/bin/corepack"
        : "/Users/me/.local/share/pnpm/pnpm",
    );
    await expect(isCorepackShim("pnpm")).resolves.toBe(false);
  });

  it("does NOT fold case — POSIX directories are case-sensitive", async () => {
    // `/usr/bin` and `/usr/BIN` are two different directories here, so the
    // Windows case-insensitive shortcut must not leak onto POSIX: claiming
    // corepack owns a binary that lives elsewhere would route the update to
    // a corepack cache nothing on PATH consults.
    whichFirstMock.mockImplementation(async (bin: string) =>
      bin === "corepack" ? "/usr/bin/corepack" : "/usr/BIN/pnpm",
    );
    await expect(isCorepackShim("pnpm")).resolves.toBe(false);
  });
});
