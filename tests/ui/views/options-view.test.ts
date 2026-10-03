import type { CapturedFrame } from "@opentui/core";
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
import { COLOR_EDITOR, CONTRAST_STATUS, PREVIEW_FACT } from "../../../src/ui/text/theme-labels.js";
import { optionsView } from "../../../src/ui/views/options-view.js";
import { packagesView } from "../../../src/ui/views/packages-view.js";
import { scanView } from "../../../src/ui/views/scan-view.js";
import * as wcag from "../../support/contrast/wcag.js";
import { bootMenu, type MenuDriverOptions } from "../../support/tui/menu-driver.js";

/**
 * The Options view in the running menu, painted by the theme engine and
 * following the same settings it edits, as `gup` wires them: what the user
 * changes there reaches the whole app at once.
 */

const DARK_BACKGROUND = wcag.parseHexColor("#0B0D13");
const LIGHT_BACKGROUND = wcag.parseHexColor("#F9FAFC");

async function themedMenu(options: MenuDriverOptions = {}) {
  const settings = new SettingsService(new ConfigStore({ file: null, isDisabled: true }));
  settings.update("theme", { id: "dark" });
  return menuOn(settings, options);
}

/** The menu on Options, the theme engine and the Options view both on `settings`. */
async function menuOn(settings: SettingsService, options: MenuDriverOptions = {}) {
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
  await menu.waitForText("APPARENCE");
  return { menu, settings };
}

/**
 * The terminal parser holds a lone Escape for 20 ms (it may start an Alt
 * sequence) and only then delivers it: wait well beyond that.
 */
const ESCAPE_SETTLE_MS = 100;

async function pressEscape(menu: Awaited<ReturnType<typeof themedMenu>>["menu"]): Promise<void> {
  await menu.press("escape");
  await new Promise((resolve) => setTimeout(resolve, ESCAPE_SETTLE_MS));
}

/** What the hint bar (the last row) is painted on: the screen's background. */
function screenBackground(frame: CapturedFrame): wcag.Rgb {
  const span = frame.lines.at(-1)?.spans[0];
  if (!span) throw new Error("empty frame");
  const [red, green, blue] = span.bg.toInts();
  return [red, green, blue];
}

/** Wait until the frame satisfies `isReady`, then capture its colours. */
async function spansWhen(
  menu: Awaited<ReturnType<typeof themedMenu>>["menu"],
  isReady: (text: string) => boolean,
): Promise<CapturedFrame> {
  await menu.screen.waitForFrame(isReady);
  return menu.screen.captureSpans();
}

describe("Options view in the menu", () => {
  it("paints the theme under the picker's cursor on the whole app, and Échap brings the saved one back", async () => {
    const { menu, settings } = await themedMenu();
    expect(screenBackground(menu.screen.captureSpans())).toEqual(DARK_BACKGROUND);
    await menu.press("down", "down", "down", "enter", "down");
    const previewed = await spansWhen(menu, (text) => text.includes(PREVIEW_FACT));
    expect(screenBackground(previewed)).toEqual(LIGHT_BACKGROUND);
    await pressEscape(menu);
    const restored = await spansWhen(menu, (text) => !text.includes(PREVIEW_FACT));
    expect(screenBackground(restored)).toEqual(DARK_BACKGROUND);
    expect(settings.get("theme").id).toBe("dark");
  });

  it("applies the theme on Entrée: saved, painted, and no preview left", async () => {
    const { menu, settings } = await themedMenu();
    await menu.press("down", "down", "down", "enter", "down", "enter");
    const applied = await spansWhen(menu, (text) => text.includes("[Clair (gup)]"));
    expect(settings.get("theme").id).toBe("light");
    expect(screenBackground(applied)).toEqual(LIGHT_BACKGROUND);
    expect(await menu.frame()).not.toContain(PREVIEW_FACT);
  });

  it("switches the symbol set at once", async () => {
    const { menu } = await themedMenu();
    expect(await menu.frame()).toContain("┏━ Options");
    await menu.press("down", "down", "down", "down", "down", "down", "enter", "enter");
    const frame = await menu.waitForText("[ASCII]");
    expect(frame).not.toContain("┏");
    expect(frame).toContain("*= Options");
  });

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
    await menu.press(...Array.from({ length: 12 }, () => "down"), "enter");
    expect(settings.get("interface").packageSort).toBe("name");
    await menu.press("tab", "up");
    const frame = await menu.waitForText("Alpha.App");
    expect(frame.indexOf("Alpha.App")).toBeLessThan(frame.indexOf("Zed.Zed"));
  });
});

describe("Options in an 80 × 24 terminal", () => {
  it("shows the cursor row's hint whole, and how to leave the colour editor", async () => {
    const { menu } = await themedMenu({ size: { cols: 80, rows: 24 } });
    await menu.press("down", "down", "down");
    await menu.waitForText(CONTRAST_STATUS.pass("AA", 6.14));
    await menu.press("down", "enter");
    const editor = await menu.waitForText(COLOR_EDITOR.columns.ratio);
    expect(editor.split("\n").at(-1)).toContain("échap retour");
  });
});
