/**
 * An independent WCAG 2.x contrast oracle. The themes engine and the HTML
 * report each compute contrast in production code; their tests check them
 * against this file, written straight from the WCAG definitions, and never
 * against the production helpers — an oracle that shares the code under test
 * cannot catch its bugs.
 *
 * Definitions: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance and
 * #dfn-contrast-ratio. sRGB channels are linearised with the WCAG text's
 * 0.03928 threshold (IEC 61966-2-1 says 0.04045; no 8-bit value falls between
 * the two, so both give the same result on painted colours).
 */

/** An 8-bit sRGB colour. */
export type Rgb = readonly [red: number, green: number, blue: number];

/** Minimum contrast ratios (WCAG 2.1: 1.4.3 AA, 1.4.6 AAA, 1.4.11 non-text). */
export const WCAG_MIN_CONTRAST = {
  /** Body text, level AA. */
  text: 4.5,
  /** Text from 18 pt (or 14 pt bold), level AA. */
  largeText: 3,
  /** Body text, level AAA. */
  enhancedText: 7,
  /** Borders, focus indicators, glyphs carrying meaning. */
  nonText: 3,
} as const;

const CHANNEL_MAX = 255;
const LINEAR_THRESHOLD = 0.03928;
const LINEAR_DIVISOR = 12.92;
const GAMMA_OFFSET = 0.055;
const GAMMA_DIVISOR = 1.055;
const GAMMA_EXPONENT = 2.4;
const LUMINANCE_WEIGHTS: Rgb = [0.2126, 0.7152, 0.0722];
/** Flare term of the contrast ratio formula. */
const FLARE = 0.05;

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function assertRgb(color: Rgb): void {
  const isValid = color.every(
    (channel) => Number.isInteger(channel) && channel >= 0 && channel <= CHANNEL_MAX,
  );
  if (!isValid) throw new RangeError(`not an 8-bit sRGB colour: [${color.join(", ")}]`);
}

/** `#rgb` or `#rrggbb`, any case. Anything else throws: an oracle never guesses. */
export function parseHexColor(hex: string): Rgb {
  if (!HEX_COLOR.test(hex)) throw new SyntaxError(`not a hex colour: "${hex}"`);
  const digits = hex.length === 4 ? [...hex.slice(1)].map((digit) => digit + digit) : null;
  const pairs = digits ?? [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)];
  const [red = 0, green = 0, blue = 0] = pairs.map((pair) => Number.parseInt(pair, 16));
  return [red, green, blue];
}

function linearize(channel: number): number {
  const srgb = channel / CHANNEL_MAX;
  if (srgb <= LINEAR_THRESHOLD) return srgb / LINEAR_DIVISOR;
  return ((srgb + GAMMA_OFFSET) / GAMMA_DIVISOR) ** GAMMA_EXPONENT;
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relativeLuminance(color: Rgb): number {
  assertRgb(color);
  return color.reduce(
    (total, channel, index) => total + (LUMINANCE_WEIGHTS[index] ?? 0) * linearize(channel),
    0,
  );
}

/** WCAG contrast ratio, 1 to 21, whatever the order of the two colours. */
export function contrastRatio(first: Rgb, second: Rgb): number {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a,
  );
  return ((lighter ?? 0) + FLARE) / ((darker ?? 0) + FLARE);
}

/**
 * `from` moved toward `to` by `amount` (0 → `from`, 1 → `to`), channel by
 * channel in sRGB and rounded, as terminals and browsers composite: models a
 * colour drawn with alpha `amount` over a ground, or DIM text at 50 %.
 */
export function mix(from: Rgb, to: Rgb, amount: number): Rgb {
  assertRgb(from);
  assertRgb(to);
  if (!(amount >= 0 && amount <= 1)) throw new RangeError(`mix amount out of [0, 1]: ${amount}`);
  const channel = (index: 0 | 1 | 2): number =>
    Math.round(from[index] + (to[index] - from[index]) * amount);
  return [channel(0), channel(1), channel(2)];
}
