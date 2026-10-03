import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import { NvmWindowsProvider } from "../../../src/providers/node/nvm-windows.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import type { CommandAnswer } from "../../support/system/types.js";
import { NVM_WINDOWS_PROBE } from "./runtimes.cases.js";

/**
 * nvm-windows is a Windows project; a stray `nvm` shim elsewhere on PATH is
 * told apart by its version banner.
 */

/** Windows with an `nvm` answering `nvm version` with `answer`. */
async function nvmAnswering(answer: CommandAnswer): Promise<void> {
  await system.load({
    platform: "win32",
    bin: { nvm: "C:\\Users\\u\\AppData\\Local\\nvm\\nvm.exe" },
    commands: [{ argv: NVM_WINDOWS_PROBE, ...answer }],
  });
}

describe("NvmWindowsProvider.isAvailable", () => {
  it("is Windows-only, and probes nothing elsewhere", async () => {
    await system.load({ platform: "linux", bin: { nvm: "/usr/local/bin/nvm" } });
    const probe = replaceForTest(runner, "commandExists", () => Promise.resolve(true));
    await expect(new NvmWindowsProvider().isAvailable()).resolves.toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });

  it("stays hidden when `nvm version` fails", async () => {
    await nvmAnswering({ exitCode: 1 });
    await expect(new NvmWindowsProvider().isAvailable()).resolves.toBe(false);
  });

  it("stays hidden when the banner is not a version", async () => {
    await nvmAnswering({ stdout: "nvm.sh help text" });
    await expect(new NvmWindowsProvider().isAvailable()).resolves.toBe(false);
  });
});
