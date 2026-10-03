import { describe, expect, it } from "vitest";
import { NucleiTemplatesProvider } from "../../../src/providers/security/nuclei-templates.js";
import { system } from "../../support/system/fake-system.js";
import { nucleiMachine, TEMPLATES_RELEASE } from "./security.cases.js";

describe("NucleiTemplatesProvider.listOutdated", () => {
  it("lists nothing, and asks GitHub nothing, without a templates version", async () => {
    const answer = { stdout: "[INF] Nuclei Engine Version: v3.2.9\n" };
    await system.load({ ...nucleiMachine(answer), http: [TEMPLATES_RELEASE] });
    await expect(new NucleiTemplatesProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });
});
