import { describe, expect, it } from "vitest";
import { PnpmGlobalProvider } from "../../../src/providers/node/pnpm-global.js";
import { system } from "../../support/system/fake-system.js";
import { pnpmMachine } from "./node.cases.js";

/** `pnpm outdated --global --format json`: an object keyed by package. */

describe("PnpmGlobalProvider.listOutdated", () => {
  it("lists nothing for an empty report", async () => {
    await system.load(pnpmMachine("{}"));
    await expect(new PnpmGlobalProvider().listOutdated()).resolves.toEqual([]);
  });
});
