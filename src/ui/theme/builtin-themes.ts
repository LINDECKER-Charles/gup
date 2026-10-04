import { parseHex, type Rgb } from "./color/rgb.js";
import type { BasePalette, RgbThemeId } from "./palette.js";

/**
 * gup's RGB themes. Each one meets WCAG AA on every painted pair as written
 * (`high-contrast`: AAA) — the enforcement never has to touch them, and a
 * test keeps it that way.
 *
 * - `dark` / `light` derive from the landing site's brand tokens (navy, violet,
 *   amber, green, red).
 * - `colorblind` is built on Okabe-Ito: success sky blue, danger orange,
 *   warning yellow, accent reddish purple — never red against green; the √ ×
 *   glyphs carry the meaning too.
 * - `dracula` and `github-light` are AA-adjusted variants: a few colours
 *   differ from the canonical palettes (Dracula's muted, accent, danger and
 *   highlight; GitHub's success, warning and highlight).
 * - The highlight row is a deliberately soft tint (1.1–1.4:1 on the
 *   background): the `›` gutter glyph carries the cursor, the tint only
 *   reinforces it.
 */

type HexPalette = Readonly<Record<keyof BasePalette, string>>;

const HEX_PALETTES: Readonly<Record<RgbThemeId, HexPalette>> = {
  dark: {
    background: "#0B0D13",
    highlight: "#222535",
    text: "#EDEEF2",
    strong: "#FBFCFE",
    muted: "#A7ABB3",
    accent: "#9FA5FF",
    success: "#66DA85",
    warning: "#FDC357",
    danger: "#FF7E76",
    accentFill: "#9296FF",
    onAccent: "#0B0D13",
    borderIdle: "#656972",
    borderFocus: "#9FA5FF",
  },
  light: {
    background: "#F9FAFC",
    highlight: "#E1E3F6",
    text: "#1C1F25",
    strong: "#090B0F",
    muted: "#5A5E65",
    accent: "#4F42C9",
    success: "#146D34",
    warning: "#8D5406",
    danger: "#B32322",
    accentFill: "#4F42C9",
    onAccent: "#FFFFFF",
    borderIdle: "#83868E",
    borderFocus: "#4F42C9",
  },
  "high-contrast": {
    background: "#000000",
    highlight: "#14263D",
    text: "#FFFFFF",
    strong: "#FFFFFF",
    muted: "#D0D0D0",
    accent: "#6FE8FF",
    success: "#8CFF8C",
    warning: "#FFE86B",
    danger: "#FFA0A0",
    accentFill: "#6FE8FF",
    onAccent: "#000000",
    borderIdle: "#A8A8A8",
    borderFocus: "#FFE86B",
  },
  colorblind: {
    background: "#121418",
    highlight: "#262A33",
    text: "#ECEDEF",
    strong: "#FFFFFF",
    muted: "#A9ADB5",
    accent: "#E08DC0",
    success: "#56B4E9",
    warning: "#F0E442",
    danger: "#FF8C42",
    accentFill: "#E08DC0",
    onAccent: "#121418",
    borderIdle: "#6B717C",
    borderFocus: "#E08DC0",
  },
  dracula: {
    background: "#282A36",
    highlight: "#3A3C4E",
    text: "#F8F8F2",
    strong: "#FFFFFF",
    muted: "#AEB6DA",
    accent: "#C9A6FF",
    success: "#50FA7B",
    warning: "#F1FA8C",
    danger: "#FF8585",
    accentFill: "#BD93F9",
    onAccent: "#282A36",
    borderIdle: "#6E7BAE",
    borderFocus: "#FF79C6",
  },
  "catppuccin-mocha": {
    background: "#1E1E2E",
    highlight: "#313244",
    text: "#CDD6F4",
    strong: "#F5F7FF",
    muted: "#A6ADC8",
    accent: "#89B4FA",
    success: "#A6E3A1",
    warning: "#F9E2AF",
    danger: "#F38BA8",
    accentFill: "#89B4FA",
    onAccent: "#1E1E2E",
    borderIdle: "#6C7086",
    borderFocus: "#CBA6F7",
  },
  "github-light": {
    background: "#FFFFFF",
    highlight: "#DDF4FF",
    text: "#1F2328",
    strong: "#000000",
    muted: "#59636E",
    accent: "#0969DA",
    success: "#116329",
    warning: "#8A5D00",
    danger: "#CF222E",
    accentFill: "#0969DA",
    onAccent: "#FFFFFF",
    borderIdle: "#8C959F",
    borderFocus: "#0969DA",
  },
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
export const BUILTIN_PALETTES: Readonly<Record<RgbThemeId, BasePalette>> = Object.freeze({
  dark: toPalette(HEX_PALETTES.dark),
  light: toPalette(HEX_PALETTES.light),
  "high-contrast": toPalette(HEX_PALETTES["high-contrast"]),
  colorblind: toPalette(HEX_PALETTES.colorblind),
  dracula: toPalette(HEX_PALETTES.dracula),
  "catppuccin-mocha": toPalette(HEX_PALETTES["catppuccin-mocha"]),
  "github-light": toPalette(HEX_PALETTES["github-light"]),
});
