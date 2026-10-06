import type { RgbThemeId } from "../palette.js";
import type { HexPalette } from "./hex-palette.js";

/**
 * Community themes on a light ground, from each theme's published colours.
 * Where a canonical colour falls short of AA on the background or the
 * highlight, it is moved along its lightness only, hue kept, just far enough;
 * each palette names the roles that moved.
 */
export const COMMUNITY_LIGHT_PALETTES = {
  // GitHub light. Moved for AA: success, warning, highlight.
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
} as const satisfies Readonly<Partial<Record<RgbThemeId, HexPalette>>>;
