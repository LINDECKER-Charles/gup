import { describe, expect, it } from "vitest";
import { NvimLazyProvider } from "../../../src/providers/editor-plugins/nvim-lazy.js";
import { system } from "../../support/system/fake-system.js";
import { NVIM_DIRS, nvimMachine } from "./editor-plugins.cases.js";

/** lazy.nvim installs itself under the data dir and pins plugins in the config's lock file. */

const { win32, darwin, linux } = NVIM_DIRS;

describe("NvimLazyProvider.isAvailable", () => {
  it("detects lazy.nvim from its lock file alone", async () => {
    await system.load(nvimMachine("linux", [`${linux.config}/lazy-lock.json`]));
    await expect(new NvimLazyProvider().isAvailable()).resolves.toBe(true);
  });

  it.each([
    ["win32", [`${win32.data}\\lazy`, `${win32.config}\\lazy-lock.json`]],
    ["darwin", [`${darwin.data}/lazy`, `${darwin.config}/lazy-lock.json`]],
  ] as const)("looks for both on %s, in its separators, before giving up", async (os, paths) => {
    await system.load(nvimMachine(os));
    await expect(new NvimLazyProvider().isAvailable()).resolves.toBe(false);
    expect(system.trace.fsReads).toEqual(paths);
  });
});
