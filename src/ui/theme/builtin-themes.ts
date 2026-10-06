import { parseHex, type Rgb } from "./color/rgb.js";
import { RGB_THEME_IDS, type BasePalette, type RgbThemeId } from "./palette.js";
import { COMMUNITY_DARK_PALETTES } from "./palettes/community-dark-palettes.js";
import { COMMUNITY_LIGHT_PALETTES } from "./palettes/community-light-palettes.js";
import { GUP_PALETTES } from "./palettes/gup-palettes.js";
import type { HexPalette } from "./palettes/hex-palette.js";

/**
 * gup's RGB themes, from the colours written in `palettes/`. Each one meets
 * WCAG AA on every painted pair as written (`high-contrast`: AAA) — the
 * enforcement never has to touch them, and a test keeps it that way.
 *
 * The highlight row is a deliberately soft tint (1.1–1.4:1 on the
 * background): the `›` gutter glyph carries the cursor, the tint only
 * reinforces it.
 */
const HEX_PALETTES: Readonly<Record<RgbThemeId, HexPalette>> = {
  ...GUP_PALETTES,
  ...COMMUNITY_DARK_PALETTES,
  ...COMMUNITY_LIGHT_PALETTES,
};

function toPalette(hex: HexPalette): BasePalette {
  const entries = Object.entries(hex).map(([token, value]): [string, Rgb] => {
    const color = parseHex(value);
    if (!color) throw new Error(`builtin theme: invalid colour ${value} for ${token}`);
    return [token, color];
  });
  return Object.freeze(Object.fromEntries(entries) as unknown as BasePalette);
}

/** Every RGB theme's hand-written colours (the derived `disabled` is added on resolve). */
export const BUILTIN_PALETTES = Object.freeze(
  Object.fromEntries(RGB_THEME_IDS.map((id) => [id, toPalette(HEX_PALETTES[id])])),
) as Readonly<Record<RgbThemeId, BasePalette>>;
