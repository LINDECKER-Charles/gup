import { describe, expect, it } from "vitest";
import { NucleiTemplatesProvider } from "../../../src/providers/security/nuclei-templates.js";
import { system } from "../../support/system/fake-system.js";
import { nucleiMachine, TEMPLATES_RELEASE } from "./security.cases.js";
import { useLocale } from "../../support/locale.js";

describe("NucleiTemplatesProvider.installHint in English", () => {
  // Built before the language changes, as the registry builds every provider
  // before startup has chosen one: the hint is read when shown, not here.
  const provider = new NucleiTemplatesProvider();
  useLocale("en");

  it("says what to install, then how, in the language of the moment", async () => {
    await system.load({ platform: "darwin" });
    expect(provider.installHint).toBe("Install Nuclei: brew install nuclei");
    await system.load({ platform: "win32" });
    expect(provider.installHint).toBe(
      "Install Nuclei: https://docs.projectdiscovery.io/tools/nuclei/install",
    );
  });
});

describe("NucleiTemplatesProvider.listOutdated", () => {
  it("lists nothing, and asks GitHub nothing, without a templates version", async () => {
    const answer = { stdout: "[INF] Nuclei Engine Version: v3.2.9\n" };
    await system.load({ ...nucleiMachine(answer), http: [TEMPLATES_RELEASE] });
    await expect(new NucleiTemplatesProvider().listOutdated()).resolves.toEqual([]);
    expect(system.trace.requests).toEqual([]);
  });
});
