import { describe, expect, it } from "vitest";
import { SemgrepProvider } from "../../../src/providers/security/semgrep.js";
import { system } from "../../support/system/fake-system.js";
import { installArgvs } from "../../support/system/trace.js";
import { SEMGREP_PATHS, semgrepMachine } from "./security.cases.js";

/**
 * Semgrep is upgraded with the pip of the Python that owns it, found next to
 * the semgrep on PATH; without that interpreter, gup cannot know which pip to
 * drive, and leaves the upgrade to the user.
 */

const SKIPPED = {
  id: "semgrep",
  success: false,
  skipped: true,
  message:
    "Python hôte de semgrep introuvable. Mise à jour manuelle: `python -m pip install --upgrade semgrep` depuis l'install correspondante.",
};

describe("SemgrepProvider.update", () => {
  it("leaves the upgrade to the user when semgrep is not on PATH", async () => {
    await system.load({ platform: "win32" });
    await expect(new SemgrepProvider().update("semgrep")).resolves.toEqual(SKIPPED);
  });

  it.each([
    ["windows", "win32", SEMGREP_PATHS.windows.semgrep],
    ["a virtualenv", "linux", SEMGREP_PATHS.linux.semgrep],
  ] as const)(
    "leaves the upgrade to the user when no interpreter sits beside semgrep (%s)",
    async (_label, platform, semgrep) => {
      await system.load(semgrepMachine({ platform, semgrep }));
      await expect(new SemgrepProvider().update("semgrep")).resolves.toEqual(SKIPPED);
      expect(installArgvs()).toEqual([]);
    },
  );
});
