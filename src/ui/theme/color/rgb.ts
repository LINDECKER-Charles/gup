import type { HexColor } from "../../../core/config/field-reader.js";

/**
 * 8-bit sRGB colours and the WCAG 2.x contrast maths. Every check runs on
 * the 8-bit values that are actually painted, with no epsilon: rounding can
 * never turn a pass into a fail between the check and the screen.
 */

/** An 8-bit sRGB colour, as painted. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

const CHANNEL_MAX = 255;
const HEX_RADIX = 16;
const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const LONG_HEX = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

// IEC 61966-2-1 sRGB transfer function (the WCAG text's 0.03928 threshold
// differs from 0.04045 only between two 8-bit values, so both agree here).
const LINEAR_THRESHOLD = 0.04045;
const LINEAR_SLOPE = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_SCALE = 1.055;
const GAMMA = 2.4;
/** Rec. 709 luminance weights of the linear channels. */
const LUMINANCE_WEIGHTS = { r: 0.2126, g: 0.7152, b: 0.0722 } as const;
/** Flare term of the WCAG contrast ratio. */
const FLARE = 0.05;

export const BLACK: Rgb = Object.freeze({ r: 0, g: 0, b: 0 });
export const WHITE: Rgb = Object.freeze({ r: CHANNEL_MAX, g: CHANNEL_MAX, b: CHANNEL_MAX });

/**
 * The luminance where black and white text tie (≈ 0.179): a ground below it
 * is dark. On any single ground, black or white reaches at least 4.58:1.
 */
const MID_LUMINANCE = Math.sqrt((1 + FLARE) * FLARE) - FLARE;

/** A colour from three channels, each clamped to 0..255 and rounded. */
export function rgb(r: number, g: number, b: number): Rgb {
  return Object.freeze({ r: toChannel(r), g: toChannel(g), b: toChannel(b) });
}

function toChannel(value: number): number {
  return Math.min(CHANNEL_MAX, Math.max(0, Math.round(value)));
}

/** `#rgb` or `#rrggbb`, any case; anything else is `undefined` (never guessed). */
export function parseHex(text: string): Rgb | undefined {
  const short = SHORT_HEX.exec(text);
  const digits = short
    ? short.slice(1).map((digit) => `${digit}${digit}`)
    : LONG_HEX.exec(text)?.slice(1);
  if (!digits) return undefined;
  const [r = 0, g = 0, b = 0] = digits.map((pair) => Number.parseInt(pair, HEX_RADIX));
  return rgb(r, g, b);
}

/**
 * `#RRGGBB`, upper case — the form the settings file stores. Exported for
 * tests, which compare colours in that form.
 */
export function toHex(color: Rgb): HexColor {
  const pair = (channel: number): string => channel.toString(HEX_RADIX).padStart(2, "0");
  return `#${pair(color.r)}${pair(color.g)}${pair(color.b)}`.toUpperCase() as HexColor;
}

export function isSameRgb(first: Rgb, second: Rgb): boolean {
  return first.r === second.r && first.g === second.g && first.b === second.b;
}

/** `from` moved toward `to` by `amount` (0 → `from`, 1 → `to`), channel by channel. */
export function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  const toward = (a: number, b: number): number => a + (b - a) * amount;
  return rgb(toward(from.r, to.r), toward(from.g, to.g), toward(from.b, to.b));
}

/** An 8-bit channel on the linear-light 0..1 scale. */
export function linearChannel(channel: number): number {
  const encoded = channel / CHANNEL_MAX;
  if (encoded <= LINEAR_THRESHOLD) return encoded / LINEAR_SLOPE;
  return ((encoded + GAMMA_OFFSET) / GAMMA_SCALE) ** GAMMA;
}

/** A linear-light value back to the encoded 0..255 scale (unrounded, unclamped). */
export function encodedChannel(linear: number): number {
  const encoded =
    linear <= LINEAR_THRESHOLD / LINEAR_SLOPE
      ? linear * LINEAR_SLOPE
      : GAMMA_SCALE * linear ** (1 / GAMMA) - GAMMA_OFFSET;
  return encoded * CHANNEL_MAX;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(color: Rgb): number {
  return (
    LUMINANCE_WEIGHTS.r * linearChannel(color.r) +
    LUMINANCE_WEIGHTS.g * linearChannel(color.g) +
    LUMINANCE_WEIGHTS.b * linearChannel(color.b)
  );
}

/** WCAG contrast ratio, 1 to 21, whatever the order. */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const a = relativeLuminance(first);
  const b = relativeLuminance(second);
  return (Math.max(a, b) + FLARE) / (Math.min(a, b) + FLARE);
}

/** The lowest ratio of `color` over `grounds` (Infinity without grounds). */
export function worstRatio(color: Rgb, grounds: readonly Rgb[]): number {
  return Math.min(...grounds.map((ground) => contrastRatio(color, ground)));
}

/** True for a ground where white text reads better than black. */
export function isDark(color: Rgb): boolean {
  return relativeLuminance(color) < MID_LUMINANCE;
}
