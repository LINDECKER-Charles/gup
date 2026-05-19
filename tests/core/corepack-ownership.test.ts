import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * isCorepackShim resolves PATH twice (corepack + the queried binary) and
 * compares their parent directories case-insensitively. We mock whichFirst
 * to exercise each branch without touching the filesystem.
 */
const { whichFirstMock } = vi.hoisted(() => ({ whichFirstMock: vi.fn() }));

vi.mock("../../src/core/runner.js", () => ({
  whichFirst: whichFirstMock,
}));

import { isCorepackShim } from "../../src/core/corepack-ownership.js";

beforeEach(() => {
  whichFirstMock.mockReset();
});

describe("isCorepackShim", () => {
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
