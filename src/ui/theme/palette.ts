import type { Rgb } from "./color/rgb.js";

/**
 * The vocabulary of the theme engine: the colour roles every screen paints
 * with (tokens), the themes a user can pick, and which roles they may tune.
 */

/** Every colour role the TUI paints. */
export const COLOR_TOKENS = [
  // Grounds
  "background",
  "highlight",
  // Neutral text
  "text",
  "strong",
  "muted",
  "disabled",
  // Semantic text
  "accent",
  "success",
  "warning",
  "danger",
  // The title bar and the active button
  "accentFill",
  "onAccent",
  // UI elements
  "borderIdle",
  "borderFocus",
] as const;
export type ColorToken = (typeof COLOR_TOKENS)[number];

/** A complete set of colours, one per token. */
export type Palette = Readonly<Record<ColorToken, Rgb>>;

/**
 * Tokens the engine derives (never hand-written in a theme, never edited by
 * the user): `disabled` is the dimmest grey that is still readable.
 */
export type DerivedToken = "disabled";
/** What a theme writes by hand: everything but the derived tokens. */
export type BasePalette = Readonly<Record<Exclude<ColorToken, DerivedToken>, Rgb>>;

/** The roles a user can recolour per theme. */
export const CUSTOMIZABLE_TOKENS = [
  "accent",
  "success",
  "warning",
  "danger",
  "text",
  "muted",
  "background",
  "highlight",
] as const satisfies readonly ColorToken[];
export type CustomizableToken = (typeof CUSTOMIZABLE_TOKENS)[number];

/**
 * Themes gup paints in RGB, from its own palettes: gup's own, then the
 * community themes on a dark ground, then those on a light ground, each
 * group in alphabetical order.
 */
export const RGB_THEME_IDS = [
  "dark",
  "light",
  "high-contrast",
  "colorblind",
  "ayu-dark",
  "catppuccin-mocha",
  "cobalt2",
  "dracula",
  "everforest",
  "gruvbox-dark",
  "kanagawa",
  "monokai",
  "nord",
  "one-dark",
  "rose-pine",
  "solarized-dark",
  "synthwave-84",
  "catppuccin-latte",
  "flexoki-light",
  "github-light",
  "gruvbox-light",
  "papercolor-light",
  "rose-pine-dawn",
  "solarized-light",
] as const;
export type RgbThemeId = (typeof RGB_THEME_IDS)[number];

/**
 * Every theme, in the order the picker lists them: the terminal's own
 * palette (default), gup dark/light following the terminal's background,
 * the RGB themes, then monochrome.
 */
export const THEME_IDS = ["terminal", "auto", ...RGB_THEME_IDS, "monochrome"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

/** WCAG level for text: AA (4.5:1) or AAA (7:1). */
export const CONTRAST_LEVELS = ["AA", "AAA"] as const;
export type ContrastLevel = (typeof CONTRAST_LEVELS)[number];
