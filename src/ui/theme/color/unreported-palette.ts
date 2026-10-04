import { CONTRAST_TARGETS } from "../contrast-rules.js";
import type { ContrastLevel } from "../palette.js";
import { contrastRatio, parseHex, type Rgb } from "./rgb.js";

/**
 * The colours of a terminal that does not report its palette (the Windows
 * console never answers the queries). gup cannot measure them, so it relies
 * on the defaults such terminals ship with: each role takes the first of its
 * candidates — the ANSI slot gup uses on a reported palette, its bright twin,
 * then the terminal's own text colour, which always reads — that reaches the
 * contrast level on every default gup may be running on. The colours stay the
 * terminal's own: a user who changed them still gets theirs.
 *
 * Nothing known about the terminal (not Windows, no light/dark answer either):
 * the slots of a reported palette, as before — no guess.
 */

/** A role painted as an ANSI slot, or in the terminal's own text colour. */
export type UnreportedColor =
  | { readonly kind: "slot"; readonly slot: number }
  | { readonly kind: "terminal-fg" };

/** The roles gup colours with ANSI slots when it does not know them. */
export type UnreportedRole =
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "borderIdle"
  | "borderFocus";

/** What gup knows of a terminal that did not report its palette. */
export interface UnreportedTerminal {
  readonly platform: NodeJS.Platform;
  /** Its background's lightness, when it said (a terminal may answer that alone). */
  readonly themeMode: "dark" | "light" | null;
}

interface DefaultPalette {
  readonly background: Rgb;
  /** The 16 ANSI slots. */
  readonly ansi: readonly Rgb[];
}

function palette(background: string, ansi: readonly string[]): DefaultPalette {
  const parse = (hex: string): Rgb => parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  return { background: parse(background), ansi: ansi.map(parse) };
}

/** "Campbell": the Windows console's default since Windows 10 1709, and Windows Terminal's. */
const CAMPBELL = palette("#0c0c0c", [
  "#0c0c0c", "#c50f1f", "#13a10e", "#c19c00", "#0037da", "#881798", "#3a96dd", "#cccccc",
  "#767676", "#e74856", "#16c60c", "#f9f1a5", "#3b78ff", "#b4009e", "#61d6d6", "#f2f2f2",
]);
/** The Windows console's colours before Windows 10 1709, kept by consoles set up then. */
const WINDOWS_LEGACY = palette("#000000", [
  "#000000", "#800000", "#008000", "#808000", "#000080", "#800080", "#008080", "#c0c0c0",
  "#808080", "#ff0000", "#00ff00", "#ffff00", "#0000ff", "#ff00ff", "#00ffff", "#ffffff",
]);
/** iTerm2's default profile. */
const ITERM2 = palette("#000000", [
  "#000000", "#c91b00", "#00c200", "#c7c400", "#0225c7", "#ca30c7", "#00c5c7", "#c7c7c7",
  "#686868", "#ff6e67", "#5ffa68", "#fffc67", "#6871ff", "#ff77ff", "#60fdff", "#ffffff",
]);
/** GNOME Terminal's Tango dark. */
const GNOME_TANGO = palette("#2e3436", [
  "#2e3436", "#cc0000", "#4e9a06", "#c4a000", "#3465a4", "#75507b", "#06989a", "#d3d7cf",
  "#555753", "#ef2929", "#8ae234", "#fce94f", "#729fcf", "#ad7fa8", "#34e2e2", "#eeeeec",
]);
/** macOS Terminal.app's default "Basic" profile. */
const TERMINAL_APP_BASIC = palette("#ffffff", [
  "#000000", "#990000", "#00a600", "#999900", "#0000b2", "#b200b2", "#00a6b2", "#bfbfbf",
  "#666666", "#e50000", "#00d900", "#e5e500", "#0000ff", "#e500e5", "#00e5e5", "#e5e5e5",
]);
/** xterm's defaults: black on white. */
const XTERM = palette("#ffffff", [
  "#000000", "#cd0000", "#00cd00", "#cdcd00", "#0000ee", "#cd00cd", "#00cdcd", "#e5e5e5",
  "#7f7f7f", "#ff0000", "#00ff00", "#ffff00", "#5c5cff", "#ff00ff", "#00ffff", "#ffffff",
]);

const WINDOWS_DEFAULTS = [CAMPBELL, WINDOWS_LEGACY];
const DARK_DEFAULTS = [ITERM2, GNOME_TANGO];
const LIGHT_DEFAULTS = [TERMINAL_APP_BASIC, XTERM];

/** Each role's slots, the one used on a reported palette first. */
const CANDIDATE_SLOTS: Readonly<Record<UnreportedRole, readonly number[]>> = {
  danger: [1, 9],
  success: [2, 10],
  warning: [3, 11],
  accent: [6, 14],
  borderFocus: [6, 14],
  borderIdle: [8],
};
const BORDER_ROLES: ReadonlySet<UnreportedRole> = new Set(["borderIdle", "borderFocus"]);
const ROLES = Object.keys(CANDIDATE_SLOTS) as UnreportedRole[];
const TERMINAL_FG: UnreportedColor = { kind: "terminal-fg" };

export function unreportedColors(
  terminal: UnreportedTerminal,
  level: ContrastLevel,
): Readonly<Record<UnreportedRole, UnreportedColor>> {
  const defaults = likelyDefaults(terminal);
  const entries = ROLES.map((role) => [role, colorOf(role, defaults, level)] as const);
  return Object.fromEntries(entries) as Record<UnreportedRole, UnreportedColor>;
}

function colorOf(
  role: UnreportedRole,
  defaults: readonly DefaultPalette[] | null,
  level: ContrastLevel,
): UnreportedColor {
  const candidates = CANDIDATE_SLOTS[role];
  if (defaults === null) return { kind: "slot", slot: candidates[0] ?? 0 };
  const target = CONTRAST_TARGETS[level][BORDER_ROLES.has(role) ? "ui" : "text"];
  const slot = candidates.find((candidate) => readsOnEvery(defaults, candidate, target));
  return slot === undefined ? TERMINAL_FG : { kind: "slot", slot };
}

function readsOnEvery(defaults: readonly DefaultPalette[], slot: number, target: number): boolean {
  return defaults.every(({ ansi, background }) => {
    const color = ansi[slot];
    return color !== undefined && contrastRatio(color, background) >= target;
  });
}

/**
 * The defaults the terminal most likely has: by the lightness it reported,
 * else Windows' (every console there starts dark); null when nothing is known.
 */
function likelyDefaults(terminal: UnreportedTerminal): readonly DefaultPalette[] | null {
  if (terminal.themeMode === "light") return LIGHT_DEFAULTS;
  if (terminal.platform === "win32") return WINDOWS_DEFAULTS;
  return terminal.themeMode === "dark" ? DARK_DEFAULTS : null;
}
