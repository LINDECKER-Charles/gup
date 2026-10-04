/**
 * Approximate rendered width of a SERP string, in "Latin character" units.
 *
 * Search engines truncate titles and snippets by pixels, not by UTF-16 code
 * units: a Han character is about twice as wide as a Latin one, and a
 * combining mark (Devanagari matra, Bengali vowel sign, Arabic harakat) adds
 * no width of its own. Counting `.length` would let a Chinese title run twice
 * past the cut-off and would reject a perfectly short Hindi one.
 */
const COMBINING = /\p{M}/u;

/** East Asian Wide / Fullwidth blocks the catalogs can contain. */
const WIDE_RANGES = [
  [0x1100, 0x115f], // Hangul Jamo
  [0x2e80, 0x303e], // CJK radicals, Kangxi, CJK symbols and punctuation
  [0x3041, 0x33ff], // Hiragana, Katakana, CJK compatibility
  [0x3400, 0x4dbf], // CJK Extension A
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0xac00, 0xd7a3], // Hangul syllables
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xfe30, 0xfe4f], // CJK compatibility forms
  [0xff00, 0xff60], // Fullwidth forms
  [0xffe0, 0xffe6], // Fullwidth signs
];

function charWidth(char) {
  if (COMBINING.test(char)) return 0;
  const code = char.codePointAt(0);
  return WIDE_RANGES.some(([from, to]) => code >= from && code <= to) ? 2 : 1;
}

/** @param {string} text */
export function displayWidth(text) {
  let width = 0;
  for (const char of text) width += charWidth(char);
  return width;
}
