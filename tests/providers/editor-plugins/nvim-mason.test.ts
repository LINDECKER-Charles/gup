import { describe, expect, it } from "vitest";
import { NvimMasonProvider } from "../../../src/providers/editor-plugins/nvim-mason.js";
import { system } from "../../support/system/fake-system.js";
import { NVIM_DIRS, nvimMachine } from "./editor-plugins.cases.js";

describe("NvimMasonProvider.isAvailable", () => {
  it.each([
    ["win32", `${NVIM_DIRS.win32.data}\\mason`],
    ["darwin", `${NVIM_DIRS.darwin.data}/mason`],
  ] as const)("stays hidden without mason/ in the data dir of %s", async (platform, path) => {
    await system.load(nvimMachine(platform));
    await expect(new NvimMasonProvider().isAvailable()).resolves.toBe(false);
    expect(system.trace.fsReads).toEqual([path]);
  });
});
