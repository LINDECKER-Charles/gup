import { describe, expect, it } from "vitest";
import { YarnGlobalProvider } from "../../../src/providers/node/yarn-global.js";
import { system } from "../../support/system/fake-system.js";
import { npmLatestRoute, yarnMachine } from "./node.cases.js";

/** Yarn classic only: Yarn 2+ dropped `yarn global`. */

describe("YarnGlobalProvider.isAvailable", () => {
  it.each(["4.5.0", ""])("stays hidden when `yarn --version` prints %j", async (version) => {
    await system.load(yarnMachine({ stdout: version }, ""));
    await expect(new YarnGlobalProvider().isAvailable()).resolves.toBe(false);
  });
});

describe("YarnGlobalProvider.listOutdated", () => {
  it("asks the registry nothing when the global list names no package", async () => {
    await system.load(yarnMachine({ stdout: "1.22.22" }, "Done in 0.05s."));
    await expect(new YarnGlobalProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("drops a package the registry names no version for", async () => {
    const listing = 'info "typescript@5.0.0" has binaries:';
    await system.load(yarnMachine({ stdout: "1.22.22" }, listing, [npmLatestRoute("typescript")]));
    await expect(new YarnGlobalProvider().listOutdated()).resolves.toEqual([]);
  });
});
