import { describe, expect, it } from "vitest";
import { parsePortOutdated } from "../../../src/providers/os/macports.js";

/** `port outdated`: only lines carrying the `<` comparison are ports. */

describe("parsePortOutdated", () => {
  it("returns [] on the nothing-to-do message", () => {
    expect(parsePortOutdated("No installed ports are outdated.")).toEqual([]);
  });
});
