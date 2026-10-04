import { describe, expect, it } from "vitest";
import { SELF_UPDATE_COMMAND } from "../../src/core/self-update.js";
import type { ProviderScanResult } from "../../src/core/types.js";
import { afterExitNotice } from "../../src/ui/after-exit-notice.js";
import { useLocale } from "../support/locale.js";

const GUP_ROW = {
  id: "@charles_lindecker/gup",
  current: "0.5.0",
  latest: "0.5.1",
  updateAfterExit: SELF_UPDATE_COMMAND,
};

function scanned(providerId: string, packages: ProviderScanResult["packages"]): ProviderScanResult {
  return { providerId, available: true, packages };
}

describe("afterExitNotice", () => {
  it("prints nothing when the scan left nothing for after exit", () => {
    expect(afterExitNotice([scanned("npm-g", [])])).toBe("");
  });

  it("says what to run, the command alone on its line so it copies whole", () => {
    expect(afterExitNotice([scanned("npm-g", [GUP_ROW])])).toBe(
      "\nPour mettre gup à jour maintenant qu'il est fermé, lancer :\n" +
        `  ${SELF_UPDATE_COMMAND}\n`,
    );
  });

  describe("in English", () => {
    useLocale("en");

    it("says it in English", () => {
      expect(afterExitNotice([scanned("npm-g", [GUP_ROW])])).toBe(
        `\nTo update gup now that it has exited, run:\n  ${SELF_UPDATE_COMMAND}\n`,
      );
    });
  });
});
