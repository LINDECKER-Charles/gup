import { describe, expect, it } from "vitest";
import { ComposerGlobalProvider } from "../../../src/providers/dotnet-php/composer-global.js";
import { system } from "../../support/system/fake-system.js";
import { composerGlobalMachine } from "./php.cases.js";

/** Composer's global packages, from its own JSON report. */

describe("ComposerGlobalProvider.listOutdated", () => {
  it("lists nothing when the report has no installed section", async () => {
    await system.load(composerGlobalMachine({}));
    await expect(new ComposerGlobalProvider().listOutdated()).resolves.toEqual([]);
  });
});
