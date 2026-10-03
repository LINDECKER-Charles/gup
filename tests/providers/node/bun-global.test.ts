import { describe, expect, it } from "vitest";
import { BunGlobalProvider } from "../../../src/providers/node/bun-global.js";
import { system } from "../../support/system/fake-system.js";
import { bunMachine, npmLatestRoute } from "./node.cases.js";

/** `bun pm ls -g` has no "outdated": each package is looked up on the npm registry. */

describe("BunGlobalProvider.listOutdated", () => {
  it("reads the indented layout older Bun releases print", async () => {
    const listing = ["/home/u/.bun/install/global", "  typescript@5.0.0", "  @scope/pkg@1.0.0"];
    const http = [npmLatestRoute("typescript", "5.1.0"), npmLatestRoute("@scope/pkg", "1.0.0")];
    await system.load(bunMachine(listing.join("\n"), http));
    await expect(new BunGlobalProvider().listOutdated()).resolves.toEqual([
      { id: "typescript", name: "typescript", current: "5.0.0", latest: "5.1.0" },
    ]);
  });

  it("asks the registry nothing when no line names a package", async () => {
    await system.load(bunMachine("/home/u/.bun/install/global\n"));
    await expect(new BunGlobalProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("drops a package the registry names no version for", async () => {
    await system.load(bunMachine("  typescript@5.0.0", [npmLatestRoute("typescript")]));
    await expect(new BunGlobalProvider().listOutdated()).resolves.toEqual([]);
  });
});
