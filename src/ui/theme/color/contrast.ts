import { fromOklch, toOklch, type Oklch } from "./oklch.js";
import { BLACK, isDark, WHITE, worstRatio, type Rgb } from "./rgb.js";

/**
 * Contrast correction: the smallest change of perceived lightness (OKLCH L,
 * hue kept) that makes a colour reach a contrast target on every ground it
 * is painted on. Every candidate is judged on its 8-bit value, so what is
 * returned passes exactly as painted.
 */

/** A ratio a colour must reach on every one of some grounds. */
export interface ContrastRequirement {
  readonly grounds: readonly Rgb[];
  readonly target: number;
}

/** True when `color` reaches every requirement. */
export function meetsAll(color: Rgb, requirements: readonly ContrastRequirement[]): boolean {
  return requirements.every(({ grounds, target }) => worstRatio(color, grounds) >= target);
}

/** Bisection steps on lightness: 2^-24, far below one 8-bit step. */
const LIGHTNESS_SEARCH_STEPS = 24;
const LIGHTER = 1 as const;
const DARKER = -1 as const;
const DIRECTIONS = [LIGHTER, DARKER] as const;
type Direction = typeof LIGHTER | typeof DARKER;

/**
 * `color` if it already reaches `target` on every ground (same value, so no
 * correction is recorded); otherwise the closest colour along its lightness
 * axis that does. Both directions are searched: on a mid-tone ground (near
 * the black/white tie) either may work, and the smaller move keeps the
 * colour closest to what was asked — white text on a mid teal stays light.
 * When no lightness works, the better of black and white.
 */
export function correctLightness(color: Rgb, grounds: readonly Rgb[], target: number): Rgb {
  if (worstRatio(color, grounds) >= target) return color;
  const start = toOklch(color);
  const search: ContrastRequirement = { grounds, target };
  const candidates = DIRECTIONS
    .map((direction) => searchLightness(start, search, direction))
    .filter((found): found is Oklch => found !== null);
  const closest = candidates.sort((a, b) => Math.abs(a.l - start.l) - Math.abs(b.l - start.l))[0];
  return closest ? fromOklch(closest) : bestExtreme(grounds);
}

function passes(color: Oklch, search: ContrastRequirement): boolean {
  return worstRatio(fromOklch(color), search.grounds) >= search.target;
}

/**
 * Bisection between the colour (failing) and the end of its lightness axis
 * in `direction`. The invariant "the far bound passes" holds at every step,
 * so the bound returned passes, as painted.
 */
function searchLightness(
  start: Oklch,
  search: ContrastRequirement,
  direction: Direction,
): Oklch | null {
  let far: Oklch = { ...start, l: direction === LIGHTER ? 1 : 0 };
  if (!passes(far, search)) return null;
  let near = start;
  for (let step = 0; step < LIGHTNESS_SEARCH_STEPS; step++) {
    const middle = { ...start, l: (near.l + far.l) / 2 };
    if (passes(middle, search)) far = middle;
    else near = middle;
  }
  return far;
}

/** Black or white, whichever contrasts more with the worst of the grounds. */
function bestExtreme(grounds: readonly Rgb[]): Rgb {
  return worstRatio(WHITE, grounds) >= worstRatio(BLACK, grounds) ? WHITE : BLACK;
}

/** The extreme on the far side of `ground`: white for a dark ground, black for a light one. */
export function farExtreme(ground: Rgb): Rgb {
  return isDark(ground) ? WHITE : BLACK;
}
