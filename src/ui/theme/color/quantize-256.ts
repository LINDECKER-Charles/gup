import { correctLightness, meetsAll, type ContrastRequirement } from "./contrast.js";
import { oklabDistance } from "./oklch.js";
import { rgb, worstRatio, type Rgb } from "./rgb.js";

/**
 * The xterm 256-colour palette above the 16 user-defined slots: a 6×6×6
 * colour cube (slots 16–231) and a 24-step grey ramp (232–255). Those 240
 * slots are standardized, so their RGB is known without asking the terminal;
 * slots 0–15 follow the user's theme and are never chosen.
 */

/** A palette slot and the RGB every xterm-compatible terminal shows for it. */
export interface Xterm256Color {
  readonly slot: number;
  readonly rgb: Rgb;
}

const CUBE_FIRST_SLOT = 16;
const CUBE_SIDE = 6;
const CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;
const GREY_FIRST_SLOT = 232;
const GREY_STEPS = 24;
const GREY_START = 8;
const GREY_STEP = 10;
/** The cube's corners: the fallbacks when nothing in between reaches a target. */
export const XTERM_BLACK_SLOT = 16;
export const XTERM_WHITE_SLOT = 231;

function cubeLevel(index: number): number {
  return CUBE_LEVELS[index] ?? 0;
}

function buildPalette(): readonly Xterm256Color[] {
  const colors: Xterm256Color[] = [];
  for (let index = 0; index < CUBE_SIDE ** 3; index++) {
    const red = Math.floor(index / (CUBE_SIDE * CUBE_SIDE));
    const green = Math.floor(index / CUBE_SIDE) % CUBE_SIDE;
    const blue = index % CUBE_SIDE;
    colors.push({
      slot: CUBE_FIRST_SLOT + index,
      rgb: rgb(cubeLevel(red), cubeLevel(green), cubeLevel(blue)),
    });
  }
  for (let step = 0; step < GREY_STEPS; step++) {
    const level = GREY_START + GREY_STEP * step;
    colors.push({ slot: GREY_FIRST_SLOT + step, rgb: rgb(level, level, level) });
  }
  return Object.freeze(colors);
}

const XTERM_PALETTE = buildPalette();

/** The standardized RGB of a slot in 16–255. */
export function xterm256Color(slot: number): Xterm256Color {
  const color = XTERM_PALETTE[slot - CUBE_FIRST_SLOT];
  if (!color) throw new RangeError(`not a standardized xterm slot: ${slot}`);
  return color;
}

/** Each re-correction round asks this much more contrast than the previous one. */
const QUANT_MARGIN = 0.25;
const MAX_QUANT_ROUNDS = 5;

/**
 * The nearest slot that still meets `requirements`. Quantizing moves a
 * colour by up to half a cube step, which can cost a little contrast: when
 * the nearest slot falls short, the colour is corrected toward a slightly
 * higher target and quantized again. Last resort: the cube's black or white,
 * whichever fares better.
 */
export function quantizeWithin(
  color: Rgb,
  requirements: readonly ContrastRequirement[],
): Xterm256Color {
  let nearest = nearestXterm256(color);
  for (let round = 1; round <= MAX_QUANT_ROUNDS; round++) {
    if (meetsAll(nearest.rgb, requirements)) return nearest;
    const margin = QUANT_MARGIN * round;
    const corrected = requirements.reduce(
      (current, { grounds, target }) => correctLightness(current, grounds, target + margin),
      color,
    );
    nearest = nearestXterm256(corrected);
  }
  return meetsAll(nearest.rgb, requirements) ? nearest : bestCorner(requirements);
}

function bestCorner(requirements: readonly ContrastRequirement[]): Xterm256Color {
  const black = xterm256Color(XTERM_BLACK_SLOT);
  const white = xterm256Color(XTERM_WHITE_SLOT);
  const worst = (corner: Xterm256Color): number =>
    Math.min(...requirements.map(({ grounds, target }) => worstRatio(corner.rgb, grounds) / target));
  return worst(white) >= worst(black) ? white : black;
}

/** The perceptually nearest standardized slot (OKLab distance). */
export function nearestXterm256(color: Rgb): Xterm256Color {
  let best = xterm256Color(XTERM_BLACK_SLOT);
  let bestDistance = Infinity;
  for (const candidate of XTERM_PALETTE) {
    const distance = oklabDistance(color, candidate.rgb);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
