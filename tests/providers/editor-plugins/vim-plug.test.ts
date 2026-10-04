import { describe, expect, it } from "vitest";
import { VimPlugProvider } from "../../../src/providers/editor-plugins/vim-plug.js";
import { system } from "../../support/system/fake-system.js";
import { NVIM_DIRS, nvimMachine } from "./editor-plugins.cases.js";

/** vim-plug lives in the config's autoload, the data dir's site/autoload, or has a plugged/ dir. */

const { config, data } = NVIM_DIRS.linux;

describe("VimPlugProvider.isAvailable", () => {
  it.each([`${config}/autoload/plug.vim`, `${data}/site/autoload/plug.vim`, `${data}/plugged`])(
    "detects vim-plug from %s alone",
    async (path) => {
      await system.load(nvimMachine("linux", [path]));
      await expect(new VimPlugProvider().isAvailable()).resolves.toBe(true);
    },
  );

  it("looks for all three, in the target's separators, before giving up", async () => {
    await system.load(nvimMachine("win32"));
    await expect(new VimPlugProvider().isAvailable()).resolves.toBe(false);
    const { config: winConfig, data: winData } = NVIM_DIRS.win32;
    expect(system.trace.fsReads).toEqual([
      `${winConfig}\\autoload\\plug.vim`,
      `${winData}\\site\\autoload\\plug.vim`,
      `${winData}\\plugged`,
    ]);
  });
});
