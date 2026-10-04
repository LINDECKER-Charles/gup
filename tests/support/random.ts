/**
 * A seeded pseudo-random source (mulberry32), for tests that sweep many
 * generated inputs — synthetic histories, random palettes, re-chunked
 * streams — and must replay the exact same inputs on every run and OS.
 * Not for anything security-related.
 */

// mulberry32's published constants.
const GOLDEN_GAMMA = 0x6d2b79f5;
const UINT32_RANGE = 2 ** 32;

/** A function returning floats in [0, 1), fully determined by `seed`. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + GOLDEN_GAMMA) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

/** One element of `items`, drawn with `random`. */
export function pick<T>(random: () => number, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new RangeError("pick() needs a non-empty list");
  return item;
}
