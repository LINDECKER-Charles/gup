import { describe, expect, it } from "vitest";
import { PwshModulesProvider } from "../../../src/providers/shell/pwsh-modules.js";
import { system } from "../../support/system/fake-system.js";
import { installArgvs } from "../../support/system/trace.js";
import { powerShellMachine, updateModuleArgv } from "./shell.cases.js";

describe("PwshModulesProvider.update", () => {
  it("quotes the module name for PowerShell, doubling a single quote", async () => {
    await system.load(powerShellMachine("pwsh", "[]"));
    await expect(new PwshModulesProvider().update("Foo'Bar")).resolves.toEqual({
      id: "Foo'Bar",
      success: true,
    });
    expect(installArgvs()).toEqual([updateModuleArgv("pwsh", "Foo''Bar")]);
  });
});
