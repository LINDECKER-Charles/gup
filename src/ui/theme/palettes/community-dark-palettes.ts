import type { RgbThemeId } from "../palette.js";
import type { HexPalette } from "./hex-palette.js";

/**
 * Community themes on a dark ground, from each theme's published colours.
 * Where a canonical colour falls short of AA on the background or the
 * highlight, it is moved along its lightness only, hue kept, just far enough;
 * each palette names the roles that moved.
 */
export const COMMUNITY_DARK_PALETTES = {
  // Catppuccin Mocha.
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
  // Dracula. Moved for AA: muted, accent, danger, highlight.
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
} as const satisfies Readonly<Partial<Record<RgbThemeId, HexPalette>>>;
