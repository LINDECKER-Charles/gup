import { describe, expect, it } from "vitest";
import { PubGlobalProvider } from "../../../src/providers/lang-other/pub-global.js";
import { system } from "../../support/system/fake-system.js";
import { dartMachine, pubDevRoute } from "./lang-other.cases.js";

/** `dart pub global list` prints `<package> <version>`; pub.dev knows each latest. */

describe("PubGlobalProvider.listOutdated", () => {
  it("asks pub.dev nothing for lines that name no package version", async () => {
    await system.load(dartMachine("\n  \nInvalid Line\n"));
    await expect(new PubGlobalProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });

  it("drops a package whose pub.dev entry names no latest version", async () => {
    await system.load(dartMachine("stagehand 3.3.11", [pubDevRoute("stagehand", { latest: {} })]));
    await expect(new PubGlobalProvider().listOutdated()).resolves.toEqual([]);
  });
});
