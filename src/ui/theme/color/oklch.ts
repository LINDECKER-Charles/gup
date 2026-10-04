import { encodedChannel, linearChannel, rgb, type Rgb } from "./rgb.js";

/**
 * sRGB ⇄ OKLab / OKLCH (Björn Ottosson, 2020). OKLCH separates perceived
 * lightness from hue and chroma, so a colour can be made lighter or darker
 * for contrast while it keeps its hue — an orange stays orange.
 */

/** Lightness 0..1, chroma ≥ 0, hue in degrees. */
export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

type Vector = readonly [number, number, number];
type Matrix = readonly [Vector, Vector, Vector];

// Ottosson's published matrices: linear sRGB → LMS, LMS' → OKLab, and back.
const LMS_OF_LINEAR_SRGB: Matrix = [
  [0.4122214708, 0.5363325363, 0.0514459929],
  [0.2119034982, 0.6806995451, 0.1073969566],
  [0.0883024619, 0.2817188376, 0.6299787005],
];
const OKLAB_OF_LMS: Matrix = [
  [0.2104542553, 0.793617785, -0.0040720468],
  [1.9779984951, -2.428592205, 0.4505937099],
  [0.0259040371, 0.7827717662, -0.808675766],
];
const LMS_OF_OKLAB: Matrix = [
  [1, 0.3963377774, 0.2158037573],
  [1, -0.1055613458, -0.0638541728],
  [1, -0.0894841775, -1.291485548],
];
const LINEAR_SRGB_OF_LMS: Matrix = [
  [4.0767416621, -3.3077115913, 0.2309699292],
  [-1.2684380046, 2.6097574011, -0.3413193965],
  [-0.0041960863, -0.7034186147, 1.707614701],
];

const DEGREES_PER_TURN = 360;
const RADIANS_PER_DEGREE = Math.PI / (DEGREES_PER_TURN / 2);
/** Chroma bisection steps when a colour falls outside sRGB: 2^-16 of the chroma. */
const GAMUT_SEARCH_STEPS = 16;
/** An encoded channel that still rounds into 0..255 is in gamut. */
const ROUNDING_MARGIN = 0.5;
const CHANNEL_MAX = 255;

function multiply(matrix: Matrix, vector: Vector): Vector {
  const row = (index: 0 | 1 | 2): number =>
    matrix[index][0] * vector[0] + matrix[index][1] * vector[1] + matrix[index][2] * vector[2];
  return [row(0), row(1), row(2)];
}

function oklabOf(color: Rgb): Vector {
  const linear: Vector = [linearChannel(color.r), linearChannel(color.g), linearChannel(color.b)];
  const [l, m, s] = multiply(LMS_OF_LINEAR_SRGB, linear);
  return multiply(OKLAB_OF_LMS, [Math.cbrt(l), Math.cbrt(m), Math.cbrt(s)]);
}

/** Encoded (0..255, unrounded) sRGB channels of an OKLCH colour. */
function encodedOf(color: Oklch): Vector {
  const hue = color.h * RADIANS_PER_DEGREE;
  const lab: Vector = [color.l, color.c * Math.cos(hue), color.c * Math.sin(hue)];
  const [l, m, s] = multiply(LMS_OF_OKLAB, lab);
  const linear = multiply(LINEAR_SRGB_OF_LMS, [l ** 3, m ** 3, s ** 3]);
  return [encodedChannel(linear[0]), encodedChannel(linear[1]), encodedChannel(linear[2])];
}

function isInGamut(encoded: Vector): boolean {
  return encoded.every(
    (channel) => channel >= -ROUNDING_MARGIN && channel <= CHANNEL_MAX + ROUNDING_MARGIN,
  );
}

export function toOklch(color: Rgb): Oklch {
  const [l, a, b] = oklabOf(color);
  const hue = Math.atan2(b, a) / RADIANS_PER_DEGREE;
  return { l, c: Math.hypot(a, b), h: hue < 0 ? hue + DEGREES_PER_TURN : hue };
}

/**
 * The 8-bit colour of `color`, its chroma reduced just enough to fit sRGB
 * (hue and lightness kept). Lightness is clamped to 0..1 first: beyond it,
 * no chroma fits.
 */
export function fromOklch(color: Oklch): Rgb {
  const target = { ...color, l: Math.min(1, Math.max(0, color.l)) };
  let fitted = encodedOf(target);
  if (!isInGamut(fitted)) {
    let inside = 0;
    let outside = target.c;
    for (let step = 0; step < GAMUT_SEARCH_STEPS; step++) {
      const chroma = (inside + outside) / 2;
      if (isInGamut(encodedOf({ ...target, c: chroma }))) inside = chroma;
      else outside = chroma;
    }
    fitted = encodedOf({ ...target, c: inside });
  }
  return rgb(fitted[0], fitted[1], fitted[2]);
}

/** Perceptual distance between two colours (Euclidean in OKLab). */
export function oklabDistance(first: Rgb, second: Rgb): number {
  const [l1, a1, b1] = oklabOf(first);
  const [l2, a2, b2] = oklabOf(second);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
}
