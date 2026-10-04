import { describe, expect, it } from "vitest";
import {
  canReplaceItselfWhileRunning,
  commandsAfterExit,
  isGupPackage,
  isUpdatableNow,
  SELF_UPDATE_COMMAND,
} from "../../src/core/self-update.js";
import type { ProviderScanResult } from "../../src/core/types.js";

const GUP_ROW = {
  id: "@charles_lindecker/gup",
  current: "0.5.0",
  latest: "0.5.1",
  updateAfterExit: SELF_UPDATE_COMMAND,
};

function scanned(providerId: string, packages: ProviderScanResult["packages"]): ProviderScanResult {
  return { providerId, available: true, packages };
}

describe("gup updating gup", () => {
  it("replaces itself while running everywhere but on Windows, whose DLLs stay locked", () => {
    expect(canReplaceItselfWhileRunning("win32")).toBe(false);
    expect(canReplaceItselfWhileRunning("darwin")).toBe(true);
    expect(canReplaceItselfWhileRunning("linux")).toBe(true);
  });

  it("knows its own package, and gives the README's install line for after it exits", () => {
    expect(isGupPackage("@charles_lindecker/gup")).toBe(true);
    expect(isGupPackage("@charles_lindecker/gup-landing")).toBe(false);
    expect(SELF_UPDATE_COMMAND).toBe(
      "npm install -g @charles_lindecker/gup@latest --allow-scripts=node-pty",
    );
  });

  it("collects each command left for after exit once, and nothing for regular rows", () => {
    const typescript = { id: "typescript", current: "5.0.0", latest: "5.1.0" };
    expect(isUpdatableNow(typescript)).toBe(true);
    expect(isUpdatableNow(GUP_ROW)).toBe(false);
    const scans = [scanned("npm-g", [typescript, GUP_ROW]), scanned("pnpm-g", [GUP_ROW])];
    expect(commandsAfterExit(scans)).toEqual([SELF_UPDATE_COMMAND]);
    expect(commandsAfterExit([scanned("npm-g", [typescript])])).toEqual([]);
  });
});
