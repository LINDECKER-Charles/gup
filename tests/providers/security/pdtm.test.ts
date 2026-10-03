import { describe, expect, it } from "vitest";
import { PdtmProvider } from "../../../src/providers/security/pdtm.js";
import { system } from "../../support/system/fake-system.js";
import { installArgvs } from "../../support/system/trace.js";
import { PDTM_SELF_UPDATE, pdtmMachine } from "./security.cases.js";

describe("PdtmProvider.update", () => {
  it("stops after a failed self-update, never upgrading the tools with the old pdtm", async () => {
    await system.load(pdtmMachine({ stderr: "[INF] Current Version: v0.0.9\n" }));
    system.answerInstall({ exitCode: 1 });
    await expect(new PdtmProvider().update("pdtm")).resolves.toEqual({
      id: "pdtm",
      success: false,
    });
    expect(installArgvs()).toEqual([PDTM_SELF_UPDATE]);
  });
});
