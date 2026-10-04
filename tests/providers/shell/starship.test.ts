import { describe, expect, it } from "vitest";
import { StarshipProvider } from "../../../src/providers/shell/starship.js";
import { installedVia } from "../../support/contract/installers.js";
import { useLocale } from "../../support/locale.js";
import { system } from "../../support/system/fake-system.js";

describe("StarshipProvider.update in English", () => {
  useLocale("en");

  it("offers the releases page or cargo for a hand-installed starship", async () => {
    await system.load(installedVia("manual", "starship"));
    await expect(new StarshipProvider().update("starship")).resolves.toEqual({
      id: "starship",
      success: false,
      skipped: true,
      message:
        "Download https://github.com/starship/starship/releases or " +
        "`cargo install starship --locked`",
    });
  });
});
