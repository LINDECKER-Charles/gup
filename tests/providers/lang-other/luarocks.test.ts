import { describe, expect, it } from "vitest";
import { LuaRocksProvider } from "../../../src/providers/lang-other/luarocks.js";
import { system } from "../../support/system/fake-system.js";
import { luarocksMachine } from "./lang-other.cases.js";

/** `luarocks list --outdated --porcelain`: tab-separated name, current, latest, repository. */

describe("LuaRocksProvider.listOutdated", () => {
  it("skips blank, incomplete and unchanged rows", async () => {
    const stdout = [
      "lpeg\t1.0.0\t1.1.0\thttps://luarocks.org",
      "same\t1.0\t1.0\thttps://luarocks.org",
      "  ",
      "incomplete-line",
    ].join("\n");
    await system.load(luarocksMachine(stdout));
    await expect(new LuaRocksProvider().listOutdated()).resolves.toEqual([
      { id: "lpeg", name: "lpeg", current: "1.0.0", latest: "1.1.0" },
    ]);
  });
});
