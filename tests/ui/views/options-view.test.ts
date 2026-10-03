import { describe, expect, it } from "vitest";
import { ConfigStore } from "../../../src/core/config/store.js";
import type { ProviderScanResult } from "../../../src/core/types.js";
import { setUiPreferencesSource } from "../../../src/ui/app/ui-preferences.js";
import { SettingsService } from "../../../src/ui/settings/settings-service.js";
import {
  appearanceSource,
  menuPreferencesSource,
} from "../../../src/ui/settings/settings-sources.js";
import { staticProbe } from "../../../src/ui/theme/runtime/terminal-probe.js";
import { ThemedAppearance } from "../../../src/ui/theme/runtime/themed-appearance.js";
import { optionsView } from "../../../src/ui/views/options-view.js";
import { packagesView } from "../../../src/ui/views/packages-view.js";
import { scanView } from "../../../src/ui/views/scan-view.js";
import { bootMenu, type MenuDriverOptions } from "../../support/tui/menu-driver.js";

/**
 * The Options view in the running menu, painted by the theme engine and
 * following the same settings it edits, as `gup` wires them: what the user
 * changes there reaches the whole app at once.
 */

async function themedMenu(options: MenuDriverOptions = {}) {
  const settings = new SettingsService(new ConfigStore({ file: null, isDisabled: true }));
  settings.update("theme", { id: "dark" });
  const menu = await bootMenu({
    scanOnStart: false,
    initialView: "options",
    views: [optionsView({ settings: () => settings }), packagesView(), scanView()],
    createAppearance: (_renderer, tui) =>
      new ThemedAppearance({
        tui,
        probe: staticProbe({ colors: null, themeMode: null, depth: "truecolor", detection: "done" }),
        settings: appearanceSource(settings),
        env: {},
      }),
    ...options,
  });
  await menu.waitForText("CONFORT");
  return { menu, settings };
}

describe("Options view in the menu", () => {
  it("turns the mouse off and on, on this screen, at once", async () => {
    const { menu, settings } = await themedMenu();
    await menu.press("END", "up", "up", "up", "enter");
    expect(settings.get("interface").mouse).toBe(false);
    expect(menu.screen.renderer.useMouse).toBe(false);
    await menu.press("enter");
    expect(menu.screen.renderer.useMouse).toBe(true);
  });

  it("sorts Paquets as soon as the sort is changed", async () => {
    const scans: ProviderScanResult[] = [
      {
        providerId: "winget",
        available: true,
        packages: [
          { id: "Zed.Zed", current: "1.0", latest: "2.0" },
          { id: "Alpha.App", current: "1.0", latest: "1.1" },
        ],
      },
    ];
    const { menu, settings } = await themedMenu({ scans, scanOnStart: true });
    setUiPreferencesSource(menuPreferencesSource(settings, () => true));
    await menu.press(...Array.from({ length: 7 }, () => "down"), "enter");
    expect(settings.get("interface").packageSort).toBe("name");
    await menu.press("tab", "up");
    const frame = await menu.waitForText("Alpha.App");
    expect(frame.indexOf("Alpha.App")).toBeLessThan(frame.indexOf("Zed.Zed"));
  });
});
