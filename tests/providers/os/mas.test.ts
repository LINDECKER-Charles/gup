import { describe, expect, it } from "vitest";
import { parseMasOutdated } from "../../../src/providers/os/mas.js";

/** `mas outdated` lines: numeric App Store id, name, then `(current -> latest)`. */

describe("parseMasOutdated", () => {
  it("tolerates the arrow variants shipped across mas releases", () => {
    expect(parseMasOutdated("1 A (1.0 → 2.0)")[0]?.latest).toBe("2.0");
    expect(parseMasOutdated("1 A (1.0 < 2.0)")[0]?.latest).toBe("2.0");
  });

  it("ignores blank lines and anything that is not an app row", () => {
    expect(parseMasOutdated("\n\nWarning: something\n")).toEqual([]);
  });
});
