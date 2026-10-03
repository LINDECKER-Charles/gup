import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import { PyenvWinProvider } from "../../../src/providers/python/pyenv-win.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";

/** pyenv-win is a Windows port; elsewhere the `pyenv` on PATH is the POSIX project's. */

describe("PyenvWinProvider.isAvailable", () => {
  it("is Windows-only, and probes nothing elsewhere", async () => {
    await system.load({ platform: "linux", bin: { pyenv: "/home/u/.pyenv/bin/pyenv" } });
    const probe = replaceForTest(runner, "commandExists", () => Promise.resolve(true));
    await expect(new PyenvWinProvider().isAvailable()).resolves.toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });
});
