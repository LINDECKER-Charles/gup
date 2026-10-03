import { describe, expect, it } from "vitest";
import { CabalProvider } from "../../../src/providers/lang-other/cabal.js";
import { withRelease } from "../../support/contract/self-updating-tool.js";
import { system } from "../../support/system/fake-system.js";
import { installArgvs, probeArgvs } from "../../support/system/trace.js";
import {
  CABAL_INSTALL_ARGV,
  CABAL_MACHINE,
  CABAL_UPDATE_ARGV,
  hackageRoute,
} from "./self-updating.cases.js";

/** cabal-install rebuilds itself from Hackage, so it must see the current index first. */

describe("CabalProvider", () => {
  it("refreshes the Hackage index before rebuilding itself", async () => {
    await system.load(CABAL_MACHINE);
    await expect(new CabalProvider().update("cabal-install")).resolves.toEqual({
      id: "cabal-install",
      success: true,
    });
    expect(probeArgvs()).toEqual([CABAL_UPDATE_ARGV]);
    expect(installArgvs()).toEqual([CABAL_INSTALL_ARGV]);
  });

  it("lists nothing when Hackage names no preferred version", async () => {
    await system.load(withRelease(CABAL_MACHINE, hackageRoute({})));
    await expect(new CabalProvider().listOutdated()).resolves.toEqual([]);
  });
});
