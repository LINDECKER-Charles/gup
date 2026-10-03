import { describe, expect, it } from "vitest";
import { MacPortsProvider, parsePortOutdated } from "../../../src/providers/os/macports.js";
import { system } from "../../support/system/fake-system.js";

/** `port outdated`: only lines carrying the `<` comparison are ports. */

describe("parsePortOutdated", () => {
  it("returns [] on the nothing-to-do message", () => {
    expect(parsePortOutdated("No installed ports are outdated.")).toEqual([]);
  });
});

describe("MacPortsProvider.isAvailable", () => {
  it("is macOS-only", async () => {
    await system.load({ platform: "linux", bin: { port: "/usr/bin/port" } });
    await expect(new MacPortsProvider().isAvailable()).resolves.toBe(false);
  });
});
