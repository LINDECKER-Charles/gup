import { describe, expect, it } from "vitest";
import { CursorExtProvider } from "../../../src/providers/ide/cursor-ext.js";
import { useLocale } from "../../support/locale.js";
import { system } from "../../support/system/fake-system.js";

describe("CursorExtProvider.installHint in English", () => {
  useLocale("en");

  it("chains the cask install and the palette command on macOS", async () => {
    await system.load({ platform: "darwin" });
    expect(new CursorExtProvider().installHint).toBe(
      "brew install --cask cursor, then " +
        "Cursor → Command Palette → Shell Command: Install 'cursor' command",
    );
  });
});
