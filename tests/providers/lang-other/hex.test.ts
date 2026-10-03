import { describe, expect, it } from "vitest";
import { HexProvider } from "../../../src/providers/lang-other/hex.js";
import { withRelease } from "../../support/contract/self-updating-tool.js";
import { system } from "../../support/system/fake-system.js";
import { HEX_BANNER, hexMachine, hexPmRoute } from "./self-updating.cases.js";

/**
 * The Hex archive, not Elixir: gup needs both `mix` and the archive, and
 * takes hex.pm's stable release when there is one.
 */

const HEX_INSTALLED = hexMachine({ stdout: HEX_BANNER });

describe("HexProvider", () => {
  it("stays hidden when mix is there but the Hex archive is not", async () => {
    const missing = '** (Mix) The task "hex" could not be found';
    await system.load(hexMachine({ exitCode: 1, stderr: missing }));
    await expect(new HexProvider().isAvailable()).resolves.toBe(false);
  });

  it("falls back to the latest version when hex.pm has no stable release", async () => {
    await system.load(withRelease(HEX_INSTALLED, hexPmRoute({ latest_version: "2.0.6" })));
    await expect(new HexProvider().listOutdated()).resolves.toEqual([
      { id: "hex", name: "Hex", current: "2.0.0", latest: "2.0.6" },
    ]);
  });

  it("lists nothing when hex.pm reports no version at all", async () => {
    await system.load(withRelease(HEX_INSTALLED, hexPmRoute({})));
    await expect(new HexProvider().listOutdated()).resolves.toEqual([]);
  });
});
