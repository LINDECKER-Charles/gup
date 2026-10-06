import type { RgbThemeId } from "../palette.js";
import type { HexPalette } from "./hex-palette.js";

/**
 * Community themes on a light ground, from each theme's published colours.
 * Where a canonical colour falls short of AA on the background or the
 * highlight, it is moved along its lightness only, hue kept, just far enough;
 * each palette names the roles that moved. A `strong` the theme lacks is its
 * text, darkened. A title bar keeps the theme's own text colour: the fill is
 * the one darkened until that text reads on it.
 */
export const COMMUNITY_LIGHT_PALETTES = {
  // Catppuccin Latte; the highlight is crust, as surface0 would pull muted onto the text.
  // Moved for AA: muted, accent, success, warning, danger, title bar, idle border.
  "catppuccin-latte": {
    background: "#EFF1F5",
    highlight: "#DCE0E8",
    text: "#4C4F69",
    strong: "#2D2F47",
    muted: "#606278",
    accent: "#0E57E6",
    success: "#1C7300",
    warning: "#8E5700",
    danger: "#C80034",
    accentFill: "#1B63F2",
    onAccent: "#EFF1F5",
    borderIdle: "#878B9A",
    borderFocus: "#8839EF",
  },
  // Flexoki light (Steph Ango); accent and success are its 700 shades. Moved for AA: muted,
  // warning.
  "flexoki-light": {
    background: "#FFFCF0",
    highlight: "#E6E4D9",
    text: "#100F0F",
    strong: "#100F0F",
    muted: "#676662",
    accent: "#1C6C66",
    success: "#536907",
    warning: "#816100",
    danger: "#AF3029",
    accentFill: "#205EA6",
    onAccent: "#FFFCF0",
    borderIdle: "#878580",
    borderFocus: "#BC5215",
  },
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
  // Gruvbox light (morhetz), medium contrast; muted is its dark3. Moved for AA: accent,
  // success, warning.
  "gruvbox-light": {
    background: "#FBF1C7",
    highlight: "#EBDBB2",
    text: "#3C3836",
    strong: "#282828",
    muted: "#665C54",
    accent: "#AE3902",
    success: "#686300",
    warning: "#895600",
    danger: "#9D0006",
    accentFill: "#AF3A03",
    onAccent: "#FBF1C7",
    borderIdle: "#928374",
    borderFocus: "#076678",
  },
  // PaperColor light (NLKNguyen); muted is xterm grey 240. Moved for AA: success, warning.
  "papercolor-light": {
    background: "#EEEEEE",
    highlight: "#D0D0D0",
    text: "#444444",
    strong: "#1C1C1C",
    muted: "#585858",
    accent: "#005F87",
    success: "#006900",
    warning: "#954000",
    danger: "#AF0000",
    accentFill: "#005F87",
    onAccent: "#E4E4E4",
    borderIdle: "#878787",
    borderFocus: "#D70087",
  },
  // Rosé Pine Dawn: rose title bar, iris accent and focus, leaf success. Moved for AA: muted,
  // accent, success, warning, danger, title bar, idle border.
  "rose-pine-dawn": {
    background: "#FAF4ED",
    highlight: "#DFDAD9",
    text: "#464261",
    strong: "#2C2845",
    muted: "#625D7A",
    accent: "#6D5784",
    success: "#466661",
    warning: "#895500",
    danger: "#95485F",
    accentFill: "#AA5956",
    onAccent: "#FAF4ED",
    borderIdle: "#908B9D",
    borderFocus: "#907AA9",
  },
  // Solarized light. Text is base01 held at 5:1 so it stays apart from muted (base00 at the
  // AA floor), strong is base02. Moved for AA: text, muted, every accent, title bar, borders.
  "solarized-light": {
    background: "#FDF6E3",
    highlight: "#EEE8D5",
    text: "#50656C",
    strong: "#073642",
    muted: "#576C74",
    accent: "#006DAE",
    success: "#606F00",
    warning: "#856300",
    danger: "#CD1E21",
    accentFill: "#007F78",
    onAccent: "#FDF6E3",
    borderIdle: "#849192",
    borderFocus: "#279F96",
  },
} as const satisfies Readonly<Partial<Record<RgbThemeId, HexPalette>>>;
