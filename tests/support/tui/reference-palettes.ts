import type { ReportedColors } from "../../../src/ui/theme/terminal-palette.js";

/**
 * Real terminal palettes, as a terminal reports them over OSC 4 / 10 / 11
 * (OpenTUI's `getPalette()` shape): the default foreground and background,
 * then the 16 ANSI slots. Every detected-mode test and the contrast audit
 * run against these, so a fix that only works on one kind of terminal (dark,
 * light, low-contrast) shows up.
 */

/**
 * Windows Terminal's default dark scheme ("Campbell"), also the Windows
 * console's default since Windows 10 1709.
 */
export const CAMPBELL: ReportedColors = {
  defaultForeground: "#cccccc",
  defaultBackground: "#0c0c0c",
  palette: [
    "#0c0c0c", "#c50f1f", "#13a10e", "#c19c00", "#0037da", "#881798", "#3a96dd", "#cccccc",
    "#767676", "#e74856", "#16c60c", "#f9f1a5", "#3b78ff", "#b4009e", "#61d6d6", "#f2f2f2",
  ],
};

/** macOS Terminal.app's "Basic" profile (light). */
export const TERMINAL_APP_BASIC: ReportedColors = {
  defaultForeground: "#000000",
  defaultBackground: "#ffffff",
  palette: [
    "#000000", "#990000", "#00a600", "#999900", "#0000b2", "#b200b2", "#00a6b2", "#bfbfbf",
    "#666666", "#e50000", "#00d900", "#e5e500", "#0000ff", "#e500e5", "#00e5e5", "#e5e5e5",
  ],
};

/** Solarized Dark: its own text is below AA on its background, slot 8 is the background. */
export const SOLARIZED_DARK: ReportedColors = {
  defaultForeground: "#839496",
  defaultBackground: "#002b36",
  palette: [
    "#073642", "#dc322f", "#859900", "#b58900", "#268bd2", "#d33682", "#2aa198", "#eee8d5",
    "#002b36", "#cb4b16", "#586e75", "#657b83", "#839496", "#6c71c4", "#93a1a1", "#fdf6e3",
  ],
};

/** One Half Light (Windows Terminal, VS Code). */
export const ONE_HALF_LIGHT: ReportedColors = {
  defaultForeground: "#383a42",
  defaultBackground: "#fafafa",
  palette: [
    "#383a42", "#e45649", "#50a14f", "#c18401", "#0184bc", "#a626a4", "#0997b3", "#fafafa",
    "#4f525d", "#e06c75", "#98c379", "#e5c07b", "#61afef", "#c678dd", "#56b6c2", "#ffffff",
  ],
};

/** The Windows console before Windows 10 1709: kept by consoles set up then. */
export const WINDOWS_CONSOLE_LEGACY: ReportedColors = {
  defaultForeground: "#c0c0c0",
  defaultBackground: "#000000",
  palette: [
    "#000000", "#800000", "#008000", "#808000", "#000080", "#800080", "#008080", "#c0c0c0",
    "#808080", "#ff0000", "#00ff00", "#ffff00", "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
  ],
};

/** iTerm2's default profile. */
export const ITERM2_DEFAULT: ReportedColors = {
  defaultForeground: "#c7c7c7",
  defaultBackground: "#000000",
  palette: [
    "#000000", "#c91b00", "#00c200", "#c7c400", "#0225c7", "#ca30c7", "#00c5c7", "#c7c7c7",
    "#686868", "#ff6e67", "#5ffa68", "#fffc67", "#6871ff", "#ff77ff", "#60fdff", "#ffffff",
  ],
};

/** GNOME Terminal's Tango dark. */
export const GNOME_TANGO_DARK: ReportedColors = {
  defaultForeground: "#d3d7cf",
  defaultBackground: "#2e3436",
  palette: [
    "#2e3436", "#cc0000", "#4e9a06", "#c4a000", "#3465a4", "#75507b", "#06989a", "#d3d7cf",
    "#555753", "#ef2929", "#8ae234", "#fce94f", "#729fcf", "#ad7fa8", "#34e2e2", "#eeeeec",
  ],
};

/** xterm's defaults: black on white. */
export const XTERM_DEFAULT: ReportedColors = {
  defaultForeground: "#000000",
  defaultBackground: "#ffffff",
  palette: [
    "#000000", "#cd0000", "#00cd00", "#cdcd00", "#0000ee", "#cd00cd", "#00cdcd", "#e5e5e5",
    "#7f7f7f", "#ff0000", "#00ff00", "#ffff00", "#5c5cff", "#ff00ff", "#00ffff", "#ffffff",
  ],
};

/** What a terminal that ignores the queries answers: nothing. */
export const UNSUPPORTED: ReportedColors = {
  defaultForeground: null,
  defaultBackground: null,
  palette: Array.from({ length: 16 }, () => null),
};

export const REFERENCE_PALETTES: Readonly<Record<string, ReportedColors>> = {
  Campbell: CAMPBELL,
  "Windows console (legacy)": WINDOWS_CONSOLE_LEGACY,
  "Terminal.app Basic": TERMINAL_APP_BASIC,
  "iTerm2 default": ITERM2_DEFAULT,
  "GNOME Tango dark": GNOME_TANGO_DARK,
  xterm: XTERM_DEFAULT,
  "Solarized Dark": SOLARIZED_DARK,
  "One Half Light": ONE_HALF_LIGHT,
};
