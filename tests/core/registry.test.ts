import { describe, it, expect } from "vitest";
import { ALL_PROVIDERS, getProvider } from "../../src/core/registry.js";

describe("registry: ALL_PROVIDERS catalogue", () => {
  it("exposes unique provider ids", () => {
    const ids = ALL_PROVIDERS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("does not register the jetbrains-plugins provider (manual-only)", () => {
    expect(ALL_PROVIDERS.find((p) => p.id === "jetbrains-plugins")).toBeUndefined();
  });

  it("each provider implements the required Provider contract", () => {
    for (const p of ALL_PROVIDERS) {
      expect(typeof p.id).toBe("string");
      expect(p.id.length).toBeGreaterThan(0);
      expect(typeof p.displayName).toBe("string");
      expect(typeof p.isAvailable).toBe("function");
      expect(typeof p.listOutdated).toBe("function");
      expect(typeof p.update).toBe("function");
      expect(typeof p.updateAll).toBe("function");
    }
  });

  it("lists exactly the providers an unattended run can never update", () => {
    // Each of these always needs UAC or sudo; changing the set is a decision
    // about what a scheduled run may touch, so it takes a test edit. The flag
    // is only ever declared `false`: omitted already means true.
    const adminOnly = ALL_PROVIDERS.filter((p) => p.canUpdateUnattended === false);
    expect(adminOnly.map((p) => p.id)).toEqual([
      "choco",
      "cygwin",
      "npackd",
      "macports",
      "fink",
      "pkgin",
      "visual-studio",
    ]);
    expect(ALL_PROVIDERS.filter((p) => p.canUpdateUnattended === true)).toEqual([]);
  });

  it("getProvider returns the matching entry and undefined for unknown ids", () => {
    expect(getProvider("winget")?.id).toBe("winget");
    expect(getProvider("does-not-exist")).toBeUndefined();
  });
});
