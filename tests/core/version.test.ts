import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";

import { gupVersion } from "../../src/core/version.js";

const pkg = createRequire(import.meta.url)("../../package.json") as {
  name: string;
  version: string;
};

describe("gupVersion", () => {
  it("reports the version declared in package.json", () => {
    // The whole point of the module: no literal anywhere in src/ to drift.
    // Both `gup --version` and the menu header used to hardcode 0.1.0 while
    // the package shipped as 0.2.2.
    expect(gupVersion()).toBe(pkg.version);
  });

  it("returns a real semver, never the 0.0.0 fallback", () => {
    // The fallback exists so a missing package.json cannot crash the CLI over
    // a cosmetic string — reaching it in this repo would mean resolution broke.
    expect(gupVersion()).not.toBe("0.0.0");
    expect(gupVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("is stable across calls (memoised)", () => {
    expect(gupVersion()).toBe(gupVersion());
  });

  it("resolves the gup package, not some parent package.json", () => {
    expect(pkg.name).toBe("@charles_lindecker/gup");
  });
});
