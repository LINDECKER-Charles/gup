import {
  correctLightness,
  farExtreme,
  meetsAll,
  type ContrastRequirement,
} from "./color/contrast.js";
import { quantizeWithin } from "./color/quantize-256.js";
import { BLACK, isDark, isSameRgb, WHITE, worstRatio, type Rgb } from "./color/rgb.js";
import { CONTRAST_RULES, CONTRAST_TARGETS, TEXT_TOKENS } from "./contrast-rules.js";
import { COLOR_TOKENS, type ColorToken, type ContrastLevel, type Palette } from "./palette.js";

/**
 * Make a palette meet every rule of {@link CONTRAST_RULES}, whatever its
 * colours (a hand-edited settings file, a terminal palette, a user's custom
 * accent). Grounds first, so every later step reads final grounds:
 *
 * 1. background — far enough from the extreme on its far side (white for a
 *    dark ground) that text can reach the target with headroom;
 * 2. highlight — the same, anchored on the background's side (a light
 *    highlight on a dark background is pulled dark);
 * 3. each text token on both grounds;
 * 4. the accent fill: far enough from the extreme on the background's side
 *    that some onAccent reaches the text target on it, then visible against
 *    the background;
 * 5. onAccent on the fill;
 * 6. borders against the background.
 */

export interface Correction {
  readonly token: ColorToken;
  readonly requested: Rgb;
  readonly applied: Rgb;
  /** Worst ratio over the token's grounds, before and after. */
  readonly before: number;
  readonly after: number;
}

export interface EnforcedPalette {
  readonly palette: Palette;
  /** User-visible corrections only: target-seeking tokens are excluded. */
  readonly corrections: readonly Correction[];
  /** The lowest text ratio, target-seeking tokens excluded. */
  readonly minTextRatio: number;
}

/** A palette painted with xterm slots 16–255, and the slot of each quantized token. */
export interface QuantizedPalette {
  readonly palette: Palette;
  readonly slots: Readonly<Partial<Record<ColorToken, number>>>;
}

type Targets = (typeof CONTRAST_TARGETS)[ContrastLevel];
type Ground = "background" | "highlight";

/** Grounds reach the text target plus this, on their far extreme. */
const GROUND_HEADROOM = 1.5;
const GROUNDS: readonly Ground[] = ["background", "highlight"];
/** Everything painted on the grounds, in dependency order (the fill before its text). */
const PAINTED_ORDER = [
  ...TEXT_TOKENS,
  "accentFill",
  "onAccent",
  "borderIdle",
  "borderFocus",
] as const satisfies readonly ColorToken[];
const NOTHING_SEEKS: ReadonlySet<ColorToken> = new Set();

/**
 * `seeking`: tokens derived to sit at the floor on purpose (`disabled`, the
 * detected `muted`): corrected like the others, never reported as a change.
 */
export function enforceContrast(
  palette: Palette,
  level: ContrastLevel,
  seeking: ReadonlySet<ColorToken> = NOTHING_SEEKS,
): EnforcedPalette {
  const fixed = enforced(palette, CONTRAST_TARGETS[level]);
  return {
    palette: fixed,
    corrections: correctionsOf(palette, fixed, seeking),
    minTextRatio: minTextRatio(fixed, seeking),
  };
}

function enforced(palette: Palette, targets: Targets): Palette {
  const grounds = groundRequirement(palette.background, targets);
  let current: Palette = {
    ...palette,
    background: corrected(palette.background, [grounds]),
    highlight: corrected(palette.highlight, [grounds]),
  };
  for (const token of PAINTED_ORDER) {
    const requirements = requirementsOf(token, current, targets);
    current = { ...current, [token]: corrected(current[token], requirements) };
  }
  return current;
}

function corrected(color: Rgb, requirements: readonly ContrastRequirement[]): Rgb {
  return requirements.reduce(
    (current, requirement) => correctLightness(current, requirement.grounds, requirement.target),
    color,
  );
}

/**
 * What both grounds keep against the extreme on the far side of `background`
 * (white for a dark one): the text target plus headroom, so that extreme is
 * always a readable text colour on either ground. A background is only ever
 * pushed away from that extreme, so its side never changes once corrected.
 */
function groundRequirement(background: Rgb, targets: Targets): ContrastRequirement {
  return { grounds: [farExtreme(background)], target: targets.text + GROUND_HEADROOM };
}

/**
 * What a painted token must reach, on the colours fixed so far. The fill has
 * a second requirement besides being visible: room for its own text.
 */
function requirementsOf(
  token: (typeof PAINTED_ORDER)[number],
  current: Palette,
  targets: Targets,
): ContrastRequirement[] {
  const { background, highlight, accentFill } = current;
  switch (token) {
    case "accentFill":
      return [
        { grounds: [isDark(background) ? BLACK : WHITE], target: targets.text },
        { grounds: [background], target: targets.ui },
      ];
    case "onAccent":
      return [{ grounds: [accentFill], target: targets.text }];
    case "borderIdle":
    case "borderFocus":
      return [{ grounds: [background], target: targets.ui }];
    default:
      return [{ grounds: [background, highlight], target: targets.text }];
  }
}

/**
 * The enforced palette moved onto the standardized xterm slots (16–255), for
 * terminals that only paint 256 colours. `tokens` (the colours painted in
 * RGB) each move to the nearest slot that still meets their requirements —
 * re-corrected with a growing margin when the nearest one falls short:
 *
 * - the grounds first, keeping their headroom on their slot, so a cube
 *   corner (pure black or white) always remains readable on both;
 * - then everything painted on them, measured on the grounds as quantized.
 *
 * A colour outside `tokens` (a detected terminal's own slot or default)
 * keeps its colour, unless a moved ground leaves it short: then it moves to
 * a slot too, and `slots` says so.
 */
export function quantizeToXterm256(
  palette: Palette,
  level: ContrastLevel,
  tokens: ReadonlySet<ColorToken>,
): QuantizedPalette {
  const targets = CONTRAST_TARGETS[level];
  const slots: Partial<Record<ColorToken, number>> = {};
  let current = palette;
  const place = (token: ColorToken, requirements: readonly ContrastRequirement[]): void => {
    const { slot, rgb } = quantizeWithin(current[token], requirements);
    slots[token] = slot;
    current = { ...current, [token]: rgb };
  };
  for (const ground of GROUNDS.filter((token) => tokens.has(token))) {
    place(ground, [groundRequirement(palette.background, targets)]);
  }
  for (const token of PAINTED_ORDER) {
    const requirements = requirementsOf(token, current, targets);
    if (tokens.has(token) || !meetsAll(current[token], requirements)) place(token, requirements);
  }
  return { palette: current, slots };
}

/** The grounds a token is measured on: its rule's, or the far extreme for a ground. */
function groundsOf(token: ColorToken, palette: Palette): Rgb[] {
  const rule = CONTRAST_RULES.find((candidate) => candidate.token === token);
  if (!rule) return [farExtreme(palette.background)];
  return rule.grounds.map((ground) => palette[ground]);
}

function correctionsOf(
  requested: Palette,
  applied: Palette,
  seeking: ReadonlySet<ColorToken>,
): Correction[] {
  return COLOR_TOKENS.filter(
    (token) => !seeking.has(token) && !isSameRgb(requested[token], applied[token]),
  ).map((token) => {
    const grounds = groundsOf(token, applied);
    return {
      token,
      requested: requested[token],
      applied: applied[token],
      before: worstRatio(requested[token], grounds),
      after: worstRatio(applied[token], grounds),
    };
  });
}

/** The lowest ratio over the text rules, `seeking` tokens excluded. */
export function minTextRatio(palette: Palette, seeking: ReadonlySet<ColorToken>): number {
  const ratios = CONTRAST_RULES.filter(
    (rule) => rule.kind === "text" && !seeking.has(rule.token),
  ).map((rule) => worstRatio(palette[rule.token], groundsOf(rule.token, palette)));
  return Math.min(...ratios);
}
