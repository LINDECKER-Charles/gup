import { describe, expect, it } from "vitest";
import { FlyctlProvider } from "../../../src/providers/cloud/flyctl.js";
import { system } from "../../support/system/fake-system.js";
import { installArgvs, probeArgvs } from "../../support/system/trace.js";

/** flyctl answers to `fly` or `flyctl`: without either, there is nothing to ask or upgrade. */

describe("FlyctlProvider without fly or flyctl", () => {
  it("lists nothing, running nothing", async () => {
    await system.load({ platform: "win32" });
    await expect(new FlyctlProvider().listOutdated()).resolves.toEqual([]);
    expect(probeArgvs()).toEqual([]);
  });

  it("skips the update, saying why", async () => {
    await system.load({ platform: "win32" });
    await expect(new FlyctlProvider().update("flyctl")).resolves.toEqual({
      id: "flyctl",
      success: false,
      skipped: true,
      message: "fly/flyctl introuvable",
    });
    expect(installArgvs()).toEqual([]);
  });
});
