import type { RgbThemeId } from "../palette.js";
import type { HexPalette } from "./hex-palette.js";

/**
 * gup's own themes.
 *
 * - `dark` / `light` derive from the landing site's brand tokens (navy, violet,
 *   amber, green, red).
 * - `high-contrast` meets AAA on every painted pair, as written.
 * - `colorblind` is built on Okabe-Ito: success sky blue, danger orange,
 *   warning yellow, accent reddish purple — never red against green; the √ ×
 *   glyphs carry the meaning too.
 */
export const GUP_PALETTES = {
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
} as const satisfies Readonly<Partial<Record<RgbThemeId, HexPalette>>>;
