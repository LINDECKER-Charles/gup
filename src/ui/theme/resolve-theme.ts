import type { CustomColors, ThemeSettings } from "../settings/theme-section.js";
import { fromOklch, toOklch } from "./color/oklch.js";
import { isSameRgb, mix, parseHex, type Rgb } from "./color/rgb.js";
import { unreportedColors } from "./color/unreported-palette.js";
import { BUILTIN_PALETTES } from "./builtin-themes.js";
import {
  enforceContrast,
  minTextRatio,
  quantizeToXterm256,
  type Correction,
} from "./enforce-contrast.js";
import {
  COLOR_TOKENS,
  CUSTOMIZABLE_TOKENS,
  type BasePalette,
  type ColorToken,
  type ContrastLevel,
  type Palette,
  type RgbThemeId,
  THEME_IDS,
  type ThemeId,
} from "./palette.js";
import {
  deriveTerminalPalette,
  type DetectedColors,
  type PaintSource,
} from "./terminal-palette.js";

/**
 * Settings + what the terminal can do → the colours to paint, and how. The
 * one place that decides between painting RGB, the terminal's detected
 * palette, its raw ANSI slots, or no colour at all:
 *
 * 1. `NO_COLOR` → monochrome; 2. the `monochrome` theme → monochrome;
 * 3. a 16-colour terminal → trusted ANSI slots (RGB cannot be painted);
 * 4. `terminal` → the detected palette, enforced (while it is unknown, the
 *    terminal's own slots most likely to read: `color/unreported-palette.ts`);
 * 5. `auto` → gup dark or light per the terminal's background; 6. an RGB
 *    theme → its palette. Customs apply to their own theme; on a 256-colour
 *    terminal every RGB colour moves to a standardized slot, re-checked there.
 */

export type ColorDepth = "truecolor" | "256" | "16" | "unknown";

/** What gup knows about the terminal at a given moment. */
export interface TerminalFacts {
  /** null: not reported (unsupported, failed, or not asked yet). */
  readonly colors: DetectedColors | null;
  readonly themeMode: "dark" | "light" | null;
  readonly depth: ColorDepth;
  readonly detection: "idle" | "pending" | "done";
}

/** How a theme is painted. */
export type PaintMode = "rgb" | "detected" | "trusted" | "monochrome";

export type ThemeNotice =
  | "no-color"
  | "depth-16"
  | "depth-256"
  | "palette-unknown"
  | "palette-pending"
  | "corrected";

export interface ContrastReport {
  readonly level: ContrastLevel;
  /** null: contrast cannot be computed (trusted, monochrome). */
  readonly minTextRatio: number | null;
  readonly corrections: readonly Correction[];
  readonly notices: readonly ThemeNotice[];
}

export interface ResolvedTheme {
  readonly requested: ThemeId;
  /** The theme actually painted: `auto` resolves to dark or light, a fallback to terminal. */
  readonly effective: ThemeId;
  readonly mode: PaintMode;
  /** null in trusted and monochrome modes. */
  readonly palette: Palette | null;
  /** Tokens painted as a terminal slot or default rather than RGB. */
  readonly sources: Readonly<Partial<Record<ColorToken, PaintSource>>>;
  readonly report: ContrastReport;
}

export interface ResolveInput {
  readonly settings: ThemeSettings;
  readonly terminal: TerminalFacts;
  /** `NO_COLOR` present and non-empty (no-color.org). */
  readonly isNoColor: boolean;
  /**
   * Where gup runs: what a terminal that reports no palette most likely
   * paints with (the Windows console's defaults). Default: this process's.
   */
  readonly platform?: NodeJS.Platform;
}

/** `disabled` = the neutral of text blended this far into the background, then lifted to AA. */
const DISABLED_BLEND = 0.65;
/** Detected `muted` and the derived `disabled` sit at the floor on purpose. */
const RGB_SEEKING: ReadonlySet<ColorToken> = new Set(["disabled"]);
const DETECTED_SEEKING: ReadonlySet<ColorToken> = new Set(["muted", "disabled"]);

/** True when `NO_COLOR` asks for no colour (present and not empty). */
export function isNoColor(env: NodeJS.ProcessEnv): boolean {
  const value = env["NO_COLOR"];
  return value !== undefined && value !== "";
}

/** True for the themes that read the terminal (its palette, or its background's lightness). */
export function needsDetection(id: ThemeId): boolean {
  return id === "terminal" || id === "auto";
}

/** A theme as the picker lists it: whether it can be painted here, and how readable it is. */
export interface ThemeAvailability {
  readonly id: ThemeId;
  readonly isAvailable: boolean;
  /** Why not: the terminal cannot paint it. */
  readonly reason?: "depth-16";
  /** Lowest text ratio once resolved here; null when it cannot be computed. */
  readonly minTextRatio: number | null;
  /** How it would be painted here. */
  readonly mode: PaintMode;
  /** True when some of its colours had to be adjusted to reach the contrast level. */
  readonly isCorrected: boolean;
}

/** Every theme, resolved against the same settings and terminal as `input`. */
export function themeAvailability(input: ResolveInput): ThemeAvailability[] {
  return THEME_IDS.map((id) => {
    const { report, mode } = resolveTheme({ ...input, settings: { ...input.settings, id } });
    const isUnpaintable = report.notices.includes("depth-16");
    return {
      id,
      isAvailable: !isUnpaintable,
      ...(isUnpaintable && { reason: "depth-16" as const }),
      minTextRatio: report.minTextRatio,
      mode,
      isCorrected: report.corrections.length > 0,
    };
  });
}

export function resolveTheme(input: ResolveInput): ResolvedTheme {
  const { settings, terminal } = input;
  const { id } = settings;
  if (input.isNoColor) return withoutPalette(settings, "monochrome", ["no-color"]);
  if (id === "monochrome") return withoutPalette(settings, "monochrome", []);
  if (terminal.depth === "16") return trusted(input, id === "terminal" ? [] : ["depth-16"]);
  if (id === "terminal") return resolveTerminal(input);
  return resolveRgb({ settings, terminal, id });
}

function withoutPalette(
  settings: ThemeSettings,
  mode: "trusted" | "monochrome",
  notices: readonly ThemeNotice[],
): ResolvedTheme {
  return {
    requested: settings.id,
    effective: mode === "monochrome" ? "monochrome" : "terminal",
    mode,
    palette: null,
    sources: {},
    report: { level: settings.contrast, minTextRatio: null, corrections: [], notices },
  };
}

/**
 * The terminal's own colours, unmeasured: its text colour, and for each
 * coloured role the ANSI slot most likely to read on it (`unreportedColors`).
 */
function trusted(input: ResolveInput, notices: readonly ThemeNotice[]): ResolvedTheme {
  const terminal = {
    platform: input.platform ?? process.platform,
    themeMode: input.terminal.themeMode,
  };
  const sources = unreportedColors(terminal, input.settings.contrast);
  return { ...withoutPalette(input.settings, "trusted", notices), sources };
}

function resolveTerminal(input: ResolveInput): ResolvedTheme {
  const { settings, terminal } = input;
  if (!terminal.colors) {
    const isPending = terminal.detection !== "done";
    return trusted(input, [isPending ? "palette-pending" : "palette-unknown"]);
  }
  const derived = deriveTerminalPalette(terminal.colors);
  const enforced = enforceContrast(
    prepared(derived.palette, settings.custom.terminal),
    settings.contrast,
    DETECTED_SEEKING,
  );
  // A colour the enforcement (or the user) changed is painted in RGB; the
  // others stay the terminal's own slot or default.
  const reported: Partial<Palette> = derived.palette;
  const kept = COLOR_TOKENS.filter((token) => {
    const original = reported[token];
    return derived.sources[token] && original && isSameRgb(enforced.palette[token], original);
  });
  const sources = Object.fromEntries(kept.map((token) => [token, derived.sources[token]]));
  return finish({ settings, terminal, mode: "detected", enforced, sources });
}

interface RgbRequest {
  readonly settings: ThemeSettings;
  readonly terminal: TerminalFacts;
  readonly id: RgbThemeId | "auto";
}

function resolveRgb({ settings, terminal, id }: RgbRequest): ResolvedTheme {
  const auto = terminal.themeMode === "light" ? "light" : "dark";
  const effective = id === "auto" ? auto : id;
  const palette = prepared(BUILTIN_PALETTES[effective], settings.custom[id]);
  const enforced = enforceContrast(palette, settings.contrast, RGB_SEEKING);
  return finish({ settings, terminal, mode: "rgb", enforced, sources: {}, effective });
}

/** A theme's palette with the user's colours for it, and the derived tokens. */
function prepared(base: BasePalette, customs: CustomColors | undefined): Palette {
  const tuned = withCustoms(base, customs);
  const disabled = neutral(mix(tuned.text, tuned.background, DISABLED_BLEND));
  return { ...tuned, disabled };
}

/**
 * The user's colours over the theme's. A custom accent also colours the
 * title bar and the focused border, which follow the accent everywhere.
 */
function withCustoms(base: BasePalette, customs: CustomColors | undefined): BasePalette {
  if (!customs) return base;
  const overrides = CUSTOMIZABLE_TOKENS.flatMap((token): Array<[ColorToken, Rgb]> => {
    const color = parseHex(customs[token] ?? "");
    return color ? [[token, color]] : [];
  });
  const tuned: BasePalette = { ...base, ...Object.fromEntries(overrides) };
  const accent = parseHex(customs.accent ?? "");
  return accent ? { ...tuned, accentFill: accent, borderFocus: accent } : tuned;
}

/** The grey of the same perceived lightness. */
function neutral(color: Rgb): Rgb {
  return fromOklch({ ...toOklch(color), c: 0 });
}

interface Finishing {
  readonly settings: ThemeSettings;
  readonly terminal: TerminalFacts;
  readonly mode: "rgb" | "detected";
  readonly enforced: ReturnType<typeof enforceContrast>;
  readonly sources: Readonly<Partial<Record<ColorToken, PaintSource>>>;
  /** Default: the requested theme. */
  readonly effective?: ThemeId;
}

/**
 * The enforced palette as painted: on a 256-colour terminal, every colour
 * painted in RGB moves to a standardized slot (re-checked there); the report
 * measures what is painted.
 */
function finish(parts: Finishing): ResolvedTheme {
  const { settings, enforced, mode } = parts;
  const seeking = mode === "rgb" ? RGB_SEEKING : DETECTED_SEEKING;
  const painted = onTerminalDepth(parts);
  const notices: ThemeNotice[] = [
    ...(painted.isQuantized ? (["depth-256"] as const) : []),
    ...(enforced.corrections.length > 0 ? (["corrected"] as const) : []),
  ];
  return {
    requested: settings.id,
    effective: parts.effective ?? settings.id,
    mode,
    palette: painted.palette,
    sources: painted.sources,
    report: {
      level: settings.contrast,
      minTextRatio: minTextRatio(painted.palette, seeking),
      corrections: enforced.corrections,
      notices,
    },
  };
}

interface Painted {
  readonly palette: Palette;
  readonly sources: Readonly<Partial<Record<ColorToken, PaintSource>>>;
  readonly isQuantized: boolean;
}

/** Below truecolor, the colours painted in RGB move to the xterm slots 16–255. */
function onTerminalDepth(parts: Finishing): Painted {
  const { enforced, sources } = parts;
  const rgbTokens = COLOR_TOKENS.filter((token) => !sources[token]);
  if (parts.terminal.depth !== "256" || rgbTokens.length === 0) {
    return { palette: enforced.palette, sources, isQuantized: false };
  }
  const level = parts.settings.contrast;
  const quantized = quantizeToXterm256(enforced.palette, level, new Set(rgbTokens));
  const slots = Object.entries(quantized.slots).map(
    ([token, slot]): [string, PaintSource] => [token, { kind: "slot", slot }],
  );
  return {
    palette: quantized.palette,
    sources: { ...sources, ...Object.fromEntries(slots) },
    isQuantized: true,
  };
}
