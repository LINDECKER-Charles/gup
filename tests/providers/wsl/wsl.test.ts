import { describe, expect, it } from "vitest";
import * as runner from "../../../src/core/runner.js";
import { WslProvider } from "../../../src/providers/wsl/wsl.js";
import { replaceForTest } from "../../support/system/boundary-spy.js";
import { system } from "../../support/system/fake-system.js";
import { githubLatest } from "../../support/system/releases.js";
import { WSL_VERSION_ARGV, wslHost, wslVersionBanner } from "./wsl.cases.js";

/** The WSL kernel and wsl.exe: a Windows feature, versioned against microsoft/WSL. */

describe("WslProvider.isAvailable", () => {
  it.each(["darwin", "linux"] as const)("never looks for wsl on %s", async (platform) => {
    await system.load({ platform, bin: { wsl: "/usr/bin/wsl" } });
    const lookup = replaceForTest(runner, "commandExists", () => Promise.resolve(true));
    await expect(new WslProvider().isAvailable()).resolves.toBe(false);
    expect(lookup).not.toHaveBeenCalled();
  });

  it("is unavailable when `wsl --version` fails, as the inbox wsl.exe does", async () => {
    await system.load(wslHost([{ argv: WSL_VERSION_ARGV, exitCode: 1 }]));
    await expect(new WslProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("WslProvider.listOutdated", () => {
  it("reads a UTF-8 banner as well (WSL_UTF8=1)", async () => {
    await system.load({
      ...wslHost([{ argv: WSL_VERSION_ARGV, stdout: wslVersionBanner("2.1.0.0") }]),
      http: [githubLatest("microsoft/WSL", "2.5.10")],
    });
    await expect(new WslProvider().listOutdated()).resolves.toEqual([
      { id: "wsl", name: "WSL", current: "2.1.0.0", latest: "2.5.10" },
    ]);
  });
});
