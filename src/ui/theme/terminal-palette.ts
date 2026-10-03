import { mix, parseHex, type Rgb } from "./color/rgb.js";
import type { BasePalette, ColorToken } from "./palette.js";

/**
 * gup's semantic palette, derived from the colours the terminal reports
 * (OSC 4 / 10 / 11): its own text and background, and the ANSI slots its
 * theme defines. Unchanged colours keep being painted as the terminal's own
 * slots and defaults, so the screen still follows the terminal; only what
 * the contrast enforcement had to fix is painted in RGB.
 *
 * The bright slots (9–14) are not used: Solarized maps them to greys, which
 * would make a grey "accent". Correction keeps the normal slot's hue instead.
 */

/** The colours a terminal reported. */
export interface DetectedColors {
  readonly foreground: Rgb;
  readonly background: Rgb;
  /** The 16 ANSI slots; `null` where the terminal did not answer. */
  readonly ansi: readonly (Rgb | null)[];
}

/** How a colour reaches the terminal when it is not plain RGB. */
export type PaintSource =
  | { readonly kind: "slot"; readonly slot: number }
  | { readonly kind: "terminal-fg" }
  | { readonly kind: "terminal-bg" };

export interface DerivedTerminalPalette {
  readonly palette: BasePalette;
  /** Tokens painted as a terminal slot or default rather than RGB while unchanged. */
  readonly sources: Readonly<Partial<Record<ColorToken, PaintSource>>>;
}

/** The ANSI slots gup's semantic colours map to (normal intensity). */
export const ANSI_SLOTS = {
  danger: 1,
  success: 2,
  warning: 3,
  accent: 6,
  border: 8,
} as const;

const ANSI_SLOT_COUNT = 16;
/** Slots a palette needs to be usable: every semantic colour but the border. */
const REQUIRED_SLOTS = [
  ANSI_SLOTS.danger,
  ANSI_SLOTS.success,
  ANSI_SLOTS.warning,
  ANSI_SLOTS.accent,
] as const;
const MUTED_BLEND = 0.5;
const HIGHLIGHT_BLEND = 0.14;
const BORDER_BLEND = 0.45;

/** What OpenTUI's `getPalette()` returns, reduced to what gup reads. */
export interface ReportedColors {
  readonly palette: readonly (string | null)[];
  readonly defaultForeground: string | null;
  readonly defaultBackground: string | null;
}

/**
 * The detected colours, or `null` when the terminal did not report its
 * default colours and the slots gup paints with (an unsupported query
 * answers all-null).
 */
export function detectedColorsFrom(reported: ReportedColors): DetectedColors | null {
  const foreground = parseHex(reported.defaultForeground ?? "");
  const background = parseHex(reported.defaultBackground ?? "");
  const ansi = Array.from({ length: ANSI_SLOT_COUNT }, (_, slot) =>
    parseHex(reported.palette[slot] ?? ""),
  ).map((color) => color ?? null);
  const hasSlots = REQUIRED_SLOTS.every((slot) => ansi[slot] !== null);
  if (!foreground || !background || !hasSlots) return null;
  return { foreground, background, ansi };
}

function slotColor(detected: DetectedColors, slot: number): Rgb {
  return detected.ansi[slot] ?? detected.foreground;
}

/**
 * gup's palette for a detected terminal (`disabled` is derived on resolve):
 * text in the terminal's foreground, semantic colours from slots 6/2/3/1,
 * a highlight and a muted tone blended from the terminal's two defaults,
 * borders on slot 8, the title bar on the accent slot with the background
 * as its text.
 */
export function deriveTerminalPalette(detected: DetectedColors): DerivedTerminalPalette {
  const borderSlot = detected.ansi[ANSI_SLOTS.border] ?? null;
  return {
    palette: derivedColors(detected, borderSlot),
    sources: {
      ...SOURCES,
      ...(borderSlot !== null && { borderIdle: slotSource(ANSI_SLOTS.border) }),
    },
  };
}

function slotSource(slot: number): PaintSource {
  return { kind: "slot", slot };
}

/**
 * Where every token comes from while unchanged (the idle border depends on
 * slot 8). onAccent has the background's colour but no source: a terminal's
 * "default" colour means its foreground when used for text, so the
 * background's value can only reach a foreground as RGB.
 */
const SOURCES: Readonly<Partial<Record<ColorToken, PaintSource>>> = {
  background: { kind: "terminal-bg" },
  text: { kind: "terminal-fg" },
  strong: { kind: "terminal-fg" },
  accent: slotSource(ANSI_SLOTS.accent),
  success: slotSource(ANSI_SLOTS.success),
  warning: slotSource(ANSI_SLOTS.warning),
  danger: slotSource(ANSI_SLOTS.danger),
  accentFill: slotSource(ANSI_SLOTS.accent),
  borderFocus: slotSource(ANSI_SLOTS.accent),
};

function derivedColors(detected: DetectedColors, borderSlot: Rgb | null): BasePalette {
  const { foreground: fg, background: bg } = detected;
  const accent = slotColor(detected, ANSI_SLOTS.accent);
  return {
    background: bg,
    highlight: mix(bg, fg, HIGHLIGHT_BLEND),
    text: fg,
    strong: fg,
    muted: mix(fg, bg, MUTED_BLEND),
    accent,
    success: slotColor(detected, ANSI_SLOTS.success),
    warning: slotColor(detected, ANSI_SLOTS.warning),
    danger: slotColor(detected, ANSI_SLOTS.danger),
    accentFill: accent,
    onAccent: bg,
    borderIdle: borderSlot ?? mix(bg, fg, BORDER_BLEND),
    borderFocus: accent,
  };
}
