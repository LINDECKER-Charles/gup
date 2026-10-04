import { describe, expect, it } from "vitest";
import { NvimPackerProvider } from "../../../src/providers/editor-plugins/nvim-packer.js";
import { system } from "../../support/system/fake-system.js";
import { NVIM_DIRS, nvimMachine } from "./editor-plugins.cases.js";

describe("NvimPackerProvider.isAvailable", () => {
  it.each([
    ["win32", `${NVIM_DIRS.win32.data}\\site\\pack\\packer\\start\\packer.nvim`],
    ["darwin", `${NVIM_DIRS.darwin.data}/site/pack/packer/start/packer.nvim`],
  ] as const)("stays hidden without packer's start package on %s", async (platform, path) => {
    await system.load(nvimMachine(platform));
    await expect(new NvimPackerProvider().isAvailable()).resolves.toBe(false);
    expect(system.trace.fsReads).toEqual([path]);
  });
});
