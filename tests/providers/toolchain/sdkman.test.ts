import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import { SdkmanProvider } from "../../../src/providers/toolchain/sdkman.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import type { SimPlatform } from "../../support/system/types.js";
import { sdkmanMachine } from "./toolchain.cases.js";

/**
 * SDKMAN! is a shell function, not a binary: it exists when its init script
 * does and bash can source it.
 */

describe("SdkmanProvider.isAvailable", () => {
  it.each<[SimPlatform, string, string]>([
    ["darwin", "/bin/bash", "/Users/u/.sdkman/bin/sdkman-init.sh"],
    ["win32", "C:\\Program Files\\Git\\bin\\bash.exe", "C:\\Users\\u\\.sdkman\\bin\\sdkman-init.sh"],
  ])("looks for the init script with %s separators", async (platform, bash, script) => {
    await system.load({ platform, bin: { bash }, fs: { [script]: { kind: "file" } } });
    await expect(new SdkmanProvider().isAvailable()).resolves.toBe(true);
    expect(system.trace.fsReads).toEqual([script]);
  });

  it("does not look for bash without the init script", async () => {
    await system.load({ platform: "linux", bin: { bash: "/bin/bash" } });
    const probe = replaceForTest(runner, "commandExists", () => Promise.resolve(true));
    await expect(new SdkmanProvider().isAvailable()).resolves.toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });

  it("stays hidden when bash is missing", async () => {
    await system.load({ ...sdkmanMachine(), bin: {} });
    await expect(new SdkmanProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("SdkmanProvider.listOutdated", () => {
  it("asks the broker nothing when `sdk version` prints no version", async () => {
    await system.load(sdkmanMachine("nothing"));
    await expect(new SdkmanProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });
});
