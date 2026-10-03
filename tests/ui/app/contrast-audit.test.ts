import type { CapturedFrame } from "@opentui/core";
import { describe, expect, it, vi } from "vitest";
import type { MenuState } from "../../../src/commands/menu-state.js";
import { ConfigStore } from "../../../src/core/config/store.js";
import type { ProviderScanResult } from "../../../src/core/types.js";
import type { ViewDefinition } from "../../../src/ui/app/view-definition.js";
import type { ScanEvents } from "../../../src/ui/panels/scan-panel.js";
import { SettingsService } from "../../../src/ui/settings/settings-service.js";
import { appearanceSource } from "../../../src/ui/settings/settings-sources.js";
import type { AppearanceFactory } from "../../../src/ui/theme/appearance.js";
import { legacyAppearance } from "../../../src/ui/theme/legacy-appearance.js";
import { RGB_THEME_IDS, type ThemeId } from "../../../src/ui/theme/palette.js";
import type { TerminalFacts } from "../../../src/ui/theme/resolve-theme.js";
import { staticProbe } from "../../../src/ui/theme/runtime/terminal-probe.js";
import { ThemedAppearance } from "../../../src/ui/theme/runtime/themed-appearance.js";
import { detectedColorsFrom, type ReportedColors } from "../../../src/ui/theme/terminal-palette.js";
import { optionsView } from "../../../src/ui/views/options-view.js";
import { packagesView } from "../../../src/ui/views/packages-view.js";
import { providersView } from "../../../src/ui/views/providers-view.js";
import { scanView } from "../../../src/ui/views/scan-view.js";
import type * as wcag from "../../support/contrast/wcag.js";
import { frameContrastViolations } from "../../support/tui/frame-contrast.js";
import { bootMenu, type MenuDriver } from "../../support/tui/menu-driver.js";
import { CAMPBELL, TERMINAL_APP_BASIC } from "../../support/tui/reference-palettes.js";

/**
 * The end-to-end guarantee: the whole menu, driven through every registered
 * view, every Options sub-view and every dialog, paints no text below 4.5:1
 * and no border below 3:1, under every built-in theme — the terminal theme
 * on real palettes, monochrome with a real terminal's text colour — and with
 * a custom colour the user made unreadable on purpose. Whatever code path
 * paints a cell, if it escapes the theme, it fails here.
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

const UNKNOWN: TerminalFacts = {
  colors: null,
  themeMode: null,
  depth: "truecolor",
  detection: "done",
};

interface Audited {
  readonly label: string;
  readonly theme: ThemeId;
  /** What the terminal reports. */
  readonly terminal: TerminalFacts;
  /** What shows through a cell gup leaves unpainted (an RGB theme paints its own). */
  readonly ground: wcag.Rgb;
  /** The terminal's own text colour, for cells painted in its default foreground. */
  readonly ink?: wcag.Rgb;
}

const toOracle = (color: { r: number; g: number; b: number }): wcag.Rgb => [
  color.r,
  color.g,
  color.b,
];

function onTerminal(
  label: string,
  theme: ThemeId,
  reported: { readonly palette: ReportedColors; readonly mode: "dark" | "light" },
): Audited {
  const colors = detectedColorsFrom(reported.palette)!;
  return {
    label,
    theme,
    terminal: { ...UNKNOWN, colors, themeMode: reported.mode },
    ground: toOracle(colors.background),
    ink: toOracle(colors.foreground),
  };
}

const CAMPBELL_DARK = { palette: CAMPBELL, mode: "dark" } as const;
const BASIC_LIGHT = { palette: TERMINAL_APP_BASIC, mode: "light" } as const;

const AUDITED: readonly Audited[] = [
  ...RGB_THEME_IDS.map(
    (theme): Audited => ({ label: theme, theme, terminal: UNKNOWN, ground: [0, 0, 0] }),
  ),
  onTerminal("auto on a light terminal", "auto", BASIC_LIGHT),
  onTerminal("terminal on Campbell", "terminal", CAMPBELL_DARK),
  onTerminal("terminal on Terminal.app Basic", "terminal", BASIC_LIGHT),
  onTerminal("monochrome on Campbell", "monochrome", CAMPBELL_DARK),
  onTerminal("monochrome on Terminal.app Basic", "monochrome", BASIC_LIGHT),
];

/** The menu's registered views, Options editing `settings`. */
function viewsOf(settings: SettingsService): ViewDefinition[] {
  const status = async () => ({
    platform: "win32" as const,
    detected: [],
    missing: [],
    incompatible: [],
  });
  return [
    optionsView({ settings: () => settings }),
    packagesView(),
    providersView({ status }),
    scanView(),
  ];
}

/** The terminal parser holds a lone Escape for 20 ms: let it through. */
const ESCAPE_SETTLE_MS = 100;
/** An input dialog takes the focus on the next turn. */
const FOCUS_SETTLE_MS = 10;

type Capture = (state: string, shows: string) => Promise<void>;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function escape(menu: MenuDriver): Promise<void> {
  await menu.press("escape");
  await pause(ESCAPE_SETTLE_MS);
}

/**
 * Paquets, the filter, the update confirmation, Scan with a failure,
 * Providers. No Escape here: the parser would merge it with the next key.
 */
async function walkTheViews(menu: MenuDriver, capture: Capture): Promise<void> {
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
}

/** Options: the list, the timeout dialog, the theme picker and a preview, the reset dialogs. */
async function walkTheOptions(menu: MenuDriver, capture: Capture): Promise<void> {
  await menu.press("down", "enter", "down", "enter");
  await pause(FOCUS_SETTLE_MS);
  await capture("Options, timeout dialog", "Timeout par install");
  await escape(menu);
  await capture("Options, list", "APPARENCE");
  await menu.press("down", "down", "enter");
  await capture("Options, theme picker", "Aperçu");
  await menu.press("up");
  await capture("Options, theme picker on the previous theme", "Aperçu");
  await escape(menu);
  await menu.press("END", "up", "enter");
  await capture("Options, reset choice", "Scan & installation");
  await menu.press("enter");
  await capture("Options, reset confirmation", "aux valeurs par défaut");
  await menu.press("n");
}

/**
 * The colour editor, its hex dialog, and an accent typed unreadable on
 * purpose — the background's own colour: it must be painted moved, readable.
 */
async function walkTheColours(menu: MenuDriver, capture: Capture, unreadable: string) {
  await menu.press("HOME", "down", "down", "down", "down", "enter");
  await capture("colour editor", "Thème de base");
  await menu.press("enter");
  await pause(FOCUS_SETTLE_MS);
  await capture("colour editor, hex dialog", "Format #RRGGBB");
  for (let i = 0; i < "#RRGGBB".length; i++) menu.screen.mockInput.pressBackspace();
  await menu.screen.mockInput.typeText(unreadable);
  await menu.press("enter");
  await capture("colour editor, an unreadable accent adjusted", "ajustée(s) automatiquement");
  await escape(menu);
}

const hexOf = (color: wcag.Rgb): string =>
  `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;

/**
 * The theme engine over `settings` on `audited`'s terminal. A cell left
 * unpainted shows the terminal's background: on a terminal that does not say
 * which, an RGB theme's own stands in for it (it paints every cell anyway).
 */
function themedFactory(audited: Audited, settings: SettingsService, painted: { ground: wcag.Rgb }) {
  const factory: AppearanceFactory = (_renderer, tui) => {
    const appearance = new ThemedAppearance({
      tui,
      probe: staticProbe(audited.terminal),
      settings: appearanceSource(settings),
      env: {},
    });
    const { mode, palette } = appearance.resolved;
    const isGroundUnknown = audited.terminal.colors === null;
    if (isGroundUnknown && mode === "rgb" && palette) painted.ground = toOracle(palette.background);
    return appearance;
  };
  return factory;
}

async function violationsOf(audited: Audited, legacy?: AppearanceFactory): Promise<string[]> {
  const settings = new SettingsService(new ConfigStore({ file: null, isDisabled: true }));
  settings.update("theme", { id: audited.theme });
  const painted = { ground: audited.ground };
  const menu = await bootMenu({
    scans: SCANS,
    size: { cols: 110, rows: 30 },
    controller: { scan: vi.fn(scanWithFailure) },
    views: viewsOf(settings),
    createAppearance: legacy ?? themedFactory(audited, settings, painted),
  });
  const frames: Array<[string, CapturedFrame]> = [];
  const capture: Capture = async (state, shows) => {
    await menu.waitForText(shows);
    frames.push([state, menu.screen.captureSpans()]);
  };
  await walkTheViews(menu, capture);
  await walkTheOptions(menu, capture);
  const isTunable = audited.theme !== "monochrome" && legacy === undefined;
  if (isTunable) await walkTheColours(menu, capture, hexOf(painted.ground));
  return frames.flatMap(([state, frame]) =>
    frameContrastViolations(frame, {
      ground: painted.ground,
      ...(audited.ink && { ink: audited.ink }),
    }).map((v) => `${state}: "${v.text.trim()}" ${v.ratio.toFixed(2)} < ${v.needed}`),
  );
}

/** Generous: each walk drives one screen through some twenty states, on a loaded machine. */
const AUDIT_TIMEOUT_MS = 60_000;

describe("contrast audit of the menu", () => {
  it.each(AUDITED.map((audited) => [audited.label, audited] as const))(
    "%s: every text ≥ 4.5:1, every border ≥ 3:1",
    async (_label, audited) => {
      expect(await violationsOf(audited)).toEqual([]);
    },
    AUDIT_TIMEOUT_MS,
  );

  it(
    "catches what the theme does not paint: the legacy look on a light terminal",
    async () => {
      const onWhite: Audited = {
        label: "legacy",
        theme: "terminal",
        terminal: UNKNOWN,
        ground: [255, 255, 255],
      };
      expect((await violationsOf(onWhite, legacyAppearance)).length).toBeGreaterThan(0);
    },
    AUDIT_TIMEOUT_MS,
  );
});
