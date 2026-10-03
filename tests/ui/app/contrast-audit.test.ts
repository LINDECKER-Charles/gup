import type { CapturedFrame } from "@opentui/core";
import { describe, expect, it, vi } from "vitest";
import type { MenuState } from "../../../src/commands/menu-state.js";
import type { ProviderScanResult } from "../../../src/core/types.js";
import type { ScanEvents } from "../../../src/ui/panels/scan-panel.js";
import type { ThemeSettings } from "../../../src/ui/settings/theme-section.js";
import type { AppearanceFactory } from "../../../src/ui/theme/appearance.js";
import { legacyAppearance } from "../../../src/ui/theme/legacy-appearance.js";
import { RGB_THEME_IDS } from "../../../src/ui/theme/palette.js";
import type { TerminalFacts } from "../../../src/ui/theme/resolve-theme.js";
import { staticProbe } from "../../../src/ui/theme/runtime/terminal-probe.js";
import { ThemedAppearance } from "../../../src/ui/theme/runtime/themed-appearance.js";
import { detectedColorsFrom, type ReportedColors } from "../../../src/ui/theme/terminal-palette.js";
import type * as wcag from "../../support/contrast/wcag.js";
import { frameContrastViolations } from "../../support/tui/frame-contrast.js";
import { bootMenu, type MenuDriver } from "../../support/tui/menu-driver.js";
import { CAMPBELL, TERMINAL_APP_BASIC } from "../../support/tui/reference-palettes.js";

/**
 * The end-to-end guarantee: the whole menu, driven through every registered
 * view and dialog, paints no text below 4.5:1 and no border below 3:1, for
 * every RGB theme and for the terminal theme on real palettes. Whatever code
 * path paints a cell, if it escapes the theme, it fails here.
 */

const pkg = (id: string, current: string, latest: string) => ({ id, current, latest });
const SCANS: ProviderScanResult[] = [
  {
    providerId: "winget",
    available: true,
    packages: [pkg("Git.Git", "2.51.0", "2.52.0"), pkg("7zip.7zip", "25.00", "25.01")],
  },
  { providerId: "scoop", available: true, packages: [pkg("ripgrep", "14.0.0", "15.1.0")] },
];

/** A scan that finds SCANS and reports one broken provider (the danger tone). */
async function scanWithFailure(state: MenuState, events: ScanEvents): Promise<void> {
  events.detecting();
  events.planned(SCANS.length + 1);
  for (const scan of SCANS) {
    events.finished(scan.providerId, { updates: scan.packages.length, ms: 900 });
  }
  events.finished("pip", { updates: 0, ms: 15_000, error: "délai dépassé" });
  events.completed(15_000);
  state.scans = [...SCANS];
  state.detectedCount = SCANS.length + 1;
}

interface Audited {
  readonly label: string;
  readonly createAppearance: AppearanceFactory;
  /** What shows through a cell gup leaves unpainted. */
  readonly ground: wcag.Rgb;
}

const UNKNOWN: TerminalFacts = {
  colors: null,
  themeMode: null,
  depth: "truecolor",
  detection: "done",
};

function rgbTheme(id: ThemeSettings["id"]): Audited {
  let ground: wcag.Rgb = [0, 0, 0];
  const createAppearance: AppearanceFactory = (_renderer, tui) => {
    const appearance = new ThemedAppearance({
      tui,
      probe: staticProbe(UNKNOWN),
      settings: settingsOf(id),
      env: {},
    });
    const background = appearance.resolved.palette!.background;
    ground = [background.r, background.g, background.b];
    return appearance;
  };
  return {
    label: id,
    createAppearance,
    get ground() {
      return ground;
    },
  };
}

function terminalTheme(label: string, reported: ReportedColors): Audited {
  const colors = detectedColorsFrom(reported)!;
  return {
    label: `terminal on ${label}`,
    ground: [colors.background.r, colors.background.g, colors.background.b],
    createAppearance: (_renderer, tui) =>
      new ThemedAppearance({
        tui,
        probe: staticProbe({ ...UNKNOWN, colors }),
        settings: settingsOf("terminal"),
        env: {},
      }),
  };
}

function settingsOf(id: ThemeSettings["id"]) {
  const current = {
    theme: { id, contrast: "AA" as const, custom: {} },
    glyphs: "unicode" as const,
    density: "comfortable" as const,
  };
  return { current: () => current, subscribe: () => () => {} };
}

/**
 * Every screen state the menu can show, in order, each captured once it is
 * on screen. No Escape: the terminal parser holds it back to tell it from an
 * Alt sequence, and would merge it with the next key.
 */
async function walkTheMenu(menu: MenuDriver): Promise<Array<[string, CapturedFrame]>> {
  const frames: Array<[string, CapturedFrame]> = [];
  const capture = async (state: string, shows: string): Promise<void> => {
    await menu.waitForText(shows);
    frames.push([state, menu.screen.captureSpans()]);
  };
  await capture("Paquets, cursor row", "Git.Git");
  await menu.press("space", "down");
  await capture("Paquets, checked packages", "■");
  await menu.press("/", "g", "i", "t");
  await capture("Paquets, filter typed", "/ git");
  await menu.press("enter", "enter");
  await capture("update confirmation", "vont être mis à jour");
  await menu.press("n", "tab", "up");
  await capture("Scan results with a failure", "délai dépassé");
  await menu.press("down", "down");
  await capture("Providers", "╭─ Providers");
  await menu.press("down", "enter", "down", "enter");
  await new Promise((resolve) => setTimeout(resolve, 10));
  await capture("Options, timeout dialog", "Timeout par install");
  return frames;
}

async function violationsOf(audited: Audited): Promise<string[]> {
  const menu = await bootMenu({
    scans: SCANS,
    size: { cols: 110, rows: 30 },
    controller: { scan: vi.fn(scanWithFailure) },
    createAppearance: audited.createAppearance,
  });
  const frames = await walkTheMenu(menu);
  return frames.flatMap(([state, frame]) =>
    frameContrastViolations(frame, { ground: audited.ground }).map(
      (v) => `${state}: "${v.text.trim()}" ${v.ratio.toFixed(2)} < ${v.needed}`,
    ),
  );
}

describe("contrast audit of the menu", () => {
  it.each([
    ...RGB_THEME_IDS.map(rgbTheme),
    terminalTheme("Campbell", CAMPBELL),
    terminalTheme("Terminal.app Basic", TERMINAL_APP_BASIC),
  ].map((audited) => [audited.label, audited] as const))(
    "%s: every text ≥ 4.5:1, every border ≥ 3:1",
    async (_label, audited) => {
      expect(await violationsOf(audited)).toEqual([]);
    },
    30_000,
  );

  it("catches what the theme does not paint: the legacy look on a light terminal", async () => {
    const violations = await violationsOf({
      label: "legacy",
      createAppearance: legacyAppearance,
      ground: [255, 255, 255],
    });
    expect(violations.length).toBeGreaterThan(0);
  });
});
