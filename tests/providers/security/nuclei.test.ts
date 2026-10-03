import { describe, expect, it } from "vitest";
import { NucleiProvider } from "../../../src/providers/security/nuclei.js";
import { system } from "../../support/system/fake-system.js";
import { NUCLEI_RELEASE, nucleiMachine } from "./security.cases.js";

/**
 * nuclei prints its banner on stderr, and `-version` may exit non-zero after
 * printing it: the provider reads both streams and only gives up when the
 * probe failed without printing anything.
 */

describe("NucleiProvider.listOutdated", () => {
  it("reads the version a failing `-version` still printed on stderr", async () => {
    const answer = { stderr: "[INF] Nuclei Engine Version: v3.2.9\n", exitCode: 1 };
    await system.load({ ...nucleiMachine(answer), http: [NUCLEI_RELEASE] });
    await expect(new NucleiProvider().listOutdated()).resolves.toEqual([
      { id: "nuclei", name: "Nuclei", current: "3.2.9", latest: "3.3.0" },
    ]);
  });
});
