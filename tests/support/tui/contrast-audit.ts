import type { CapturedFrame, CapturedSpan } from "@opentui/core";
import { ConfigStore } from "../../../src/core/config/store.js";
import type { ViewDefinition } from "../../../src/ui/app/view-definition.js";
import { SettingsService } from "../../../src/ui/settings/settings-service.js";
import { appearanceSource } from "../../../src/ui/settings/settings-sources.js";
import type { AppearanceFactory } from "../../../src/ui/theme/appearance.js";
import { RGB_THEME_IDS, type ContrastLevel, type ThemeId } from "../../../src/ui/theme/palette.js";
import type { TerminalFacts } from "../../../src/ui/theme/resolve-theme.js";
import { staticProbe } from "../../../src/ui/theme/runtime/terminal-probe.js";
import { ThemedAppearance } from "../../../src/ui/theme/runtime/themed-appearance.js";
import { detectedColorsFrom, type ReportedColors } from "../../../src/ui/theme/terminal-palette.js";
import * as wcag from "../contrast/wcag.js";
import { frameContrastViolations } from "./frame-contrast.js";
import { bootMenu, type MenuDriver, type MenuDriverOptions } from "./menu-driver.js";
import { CAMPBELL, TERMINAL_APP_BASIC } from "./reference-palettes.js";
import { UTF8_TERMINAL_ENV } from "./test-host.js";

/**
 * The contrast audit's machinery, shared by its suites (one per part of the
 * menu, so they run in parallel): every built-in theme on the terminals that
 * matter, the whole menu booted under it, and every captured frame measured
 * with the independent WCAG oracle — 4.5:1 for text (7:1 at AAA), 3:1 for
 * borders. Whatever code path paints a cell, if it escapes the theme, a
 * suite fails.
 */

export interface Audited {
  readonly label: string;
  readonly theme: ThemeId;
  /** What the terminal reports. */
  readonly terminal: TerminalFacts;
  /** What shows through a cell gup leaves unpainted (an RGB theme paints its own). */
  readonly ground: wcag.Rgb;
  /** The terminal's own text colour, for cells painted in its default foreground. */
  readonly ink?: wcag.Rgb;
  /** The saved contrast level; default AA. */
  readonly level?: ContrastLevel;
  /** Where gup runs; default linux, where nothing is assumed of a terminal reporting no palette. */
  readonly platform?: NodeJS.Platform;
  /** The palette the terminal really has, when it does not report it: what each slot shows. */
  readonly slots?: readonly wcag.Rgb[];
}

const UNKNOWN: TerminalFacts = {
  colors: null,
  themeMode: null,
  depth: "truecolor",
  detection: "done",
};

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

/** `audited` on a terminal that paints only `depth` colours. */
function withDepth(audited: Audited, depth: TerminalFacts["depth"]): Audited {
  return { ...audited, terminal: { ...audited.terminal, depth } };
}

const CAMPBELL_DARK = { palette: CAMPBELL, mode: "dark" } as const;
const BASIC_LIGHT = { palette: TERMINAL_APP_BASIC, mode: "light" } as const;

/**
 * The `terminal` theme on a terminal that keeps `reported` to itself — the
 * Windows console never answers; a terminal may tell its lightness alone.
 * Every slot gup paints is measured as the terminal really shows it.
 */
function silent(
  label: string,
  reported: ReportedColors,
  known: Pick<Audited, "platform"> & Pick<TerminalFacts, "themeMode">,
): Audited {
  const parse = (hex: string | null): wcag.Rgb => wcag.parseHexColor(hex ?? "");
  return {
    label,
    theme: "terminal",
    terminal: { ...UNKNOWN, themeMode: known.themeMode },
    ...(known.platform && { platform: known.platform }),
    ground: parse(reported.defaultBackground),
    ink: parse(reported.defaultForeground),
    slots: reported.palette.map(parse),
  };
}

/** Every theme the audit holds the menu to, on the terminals it is held on. */
const AUDITED: readonly Audited[] = [
  ...RGB_THEME_IDS.map(
    (theme): Audited => ({ label: theme, theme, terminal: UNKNOWN, ground: [0, 0, 0] }),
  ),
  onTerminal("auto on a light terminal", "auto", BASIC_LIGHT),
  onTerminal("terminal on Campbell", "terminal", CAMPBELL_DARK),
  onTerminal("terminal on Terminal.app Basic", "terminal", BASIC_LIGHT),
  withDepth(
    onTerminal("terminal on Terminal.app Basic, 256 colours", "terminal", BASIC_LIGHT),
    "256",
  ),
  {
    label: "dark at AAA, 256 colours",
    theme: "dark",
    terminal: { ...UNKNOWN, depth: "256" },
    ground: [0, 0, 0],
    level: "AAA",
  },
  onTerminal("monochrome on Campbell", "monochrome", CAMPBELL_DARK),
  onTerminal("monochrome on Terminal.app Basic", "monochrome", BASIC_LIGHT),
  silent("terminal on the Windows console (Campbell, unreported)", CAMPBELL, {
    platform: "win32",
    themeMode: null,
  }),
  silent("terminal on Terminal.app Basic, lightness only", TERMINAL_APP_BASIC, {
    platform: "darwin",
    themeMode: "light",
  }),
];

/** The legacy look on a white terminal: what the audit must catch, the theme not painting. */
export const LEGACY_ON_WHITE: Audited = {
  label: "legacy",
  theme: "terminal",
  terminal: UNKNOWN,
  ground: [255, 255, 255],
};

/** `it.each` rows: the label first, for the test title. */
export const AUDITED_ROWS = AUDITED.map((audited) => [audited.label, audited] as const);

/** Generous: each walk drives one screen through some twenty states, on a loaded machine. */
export const AUDIT_TIMEOUT_MS = 60_000;

/** What the oracle asks of text at each level (WCAG 1.4.3 and 1.4.6). */
const TEXT_MINIMUM: Readonly<Record<ContrastLevel, number>> = {
  AA: wcag.WCAG_MIN_CONTRAST.text,
  AAA: wcag.WCAG_MIN_CONTRAST.enhancedText,
};

/** The terminal parser holds a lone Escape for 20 ms: let it through. */
const ESCAPE_SETTLE_MS = 100;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Escape, then the time the terminal parser takes to hand it over alone. */
export async function escape(menu: MenuDriver): Promise<void> {
  await menu.press("escape");
  await pause(ESCAPE_SETTLE_MS);
}

export interface AuditOptions extends Omit<MenuDriverOptions, "views" | "createAppearance"> {
  /** The menu's views, Options editing `settings`. */
  readonly views: (settings: SettingsService) => readonly ViewDefinition[];
  /** Replaces the theme engine: the legacy look, to prove the audit catches it. */
  readonly appearance?: AppearanceFactory;
  /**
   * Text drawn in the run view's embedded terminal (an installer's output,
   * gup's notes there). The pane sits on the terminal's own background, never
   * a theme-painted one (IT-6), so the theme's colours say nothing about it:
   * it must sit on the terminal's background, and be readable there whenever
   * the audited terminal's colours are known.
   */
  readonly paneTexts?: readonly string[];
}

export interface Audit {
  readonly menu: MenuDriver;
  /** What shows through an unpainted cell, once the theme resolved. */
  ground(): wcag.Rgb;
  /** Keep the frame under `state`, once it shows `shows`. */
  capture(state: string, shows: string): Promise<void>;
  /** Every captured problem: `state: "text" ratio < needed`, or pane text on a painted ground. */
  violations(): string[];
}

type SpanTest = (span: CapturedSpan) => boolean;

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
      env: UTF8_TERMINAL_ENV,
      platform: audited.platform ?? "linux",
    });
    const { mode, palette } = appearance.resolved;
    const isGroundUnknown = audited.terminal.colors === null;
    if (isGroundUnknown && mode === "rgb" && palette) painted.ground = toOracle(palette.background);
    return appearance;
  };
  return factory;
}

/** `frame` with only the spans `keep` accepts. */
function spansOf(frame: CapturedFrame, keep: SpanTest): CapturedFrame {
  const lines = frame.lines.map((line) => ({ ...line, spans: line.spans.filter(keep) }));
  return { ...frame, lines };
}

/** IT-6: the pane's text sits on the terminal's own background. */
function paintedPaneText(frame: CapturedFrame): string[] {
  return frame.lines
    .flatMap((line) => line.spans)
    .filter((span) => span.bg.intent !== "default")
    .map((span) => `"${span.text.trim()}" sits on a painted background (${span.bg.intent})`);
}

/**
 * The pane's text against the terminal's own colours, when the audited
 * terminal reports them; on a terminal that does not, its background is
 * unknown and the pane's readability with it.
 */
function unreadablePaneText(pane: CapturedFrame, audited: Audited, textMinimum: number) {
  if (audited.terminal.colors === null) return [];
  return frameContrastViolations(pane, {
    ground: audited.ground,
    textMinimum,
    ...(audited.ink && { ink: audited.ink }),
  }).map((v) => `"${v.text.trim()}" ${v.ratio.toFixed(2)} < ${v.needed} in the terminal pane`);
}

export async function auditMenu(audited: Audited, options: AuditOptions): Promise<Audit> {
  const { views, appearance, paneTexts = [], ...driver } = options;
  const settings = new SettingsService(new ConfigStore({ file: null, isDisabled: true }));
  settings.update("theme", { id: audited.theme, contrast: audited.level ?? "AA" });
  const painted = { ground: audited.ground };
  const menu = await bootMenu({
    ...driver,
    views: views(settings),
    createAppearance: appearance ?? themedFactory(audited, settings, painted),
  });
  const frames: Array<[string, CapturedFrame]> = [];
  const isInPane: SpanTest = (span) => paneTexts.some((text) => span.text.includes(text));
  const textMinimum = TEXT_MINIMUM[audited.level ?? "AA"];
  const problemsOf = (frame: CapturedFrame): string[] => {
    const pane = spansOf(frame, isInPane);
    return [
      ...frameContrastViolations(spansOf(frame, (span) => !isInPane(span)), {
        ground: painted.ground,
        textMinimum,
        ...(audited.ink && { ink: audited.ink }),
        ...(audited.slots && { slots: audited.slots }),
      }).map((v) => `"${v.text.trim()}" ${v.ratio.toFixed(2)} < ${v.needed}`),
      ...paintedPaneText(pane),
      ...unreadablePaneText(pane, audited, textMinimum),
    ];
  };
  return {
    menu,
    ground: () => painted.ground,
    capture: async (state, shows) => {
      await menu.waitForText(shows);
      frames.push([state, menu.screen.captureSpans()]);
    },
    violations: () =>
      frames.flatMap(([state, frame]) =>
        problemsOf(frame).map((problem) => `${state}: ${problem}`),
      ),
  };
}
