import type { BorderCharacters } from "@opentui/core";

/**
 * The symbols gup draws, and their single-column ASCII stand-ins for
 * terminals whose font or console cannot show them (the Linux VT console, a
 * `TERM=dumb` session, a POSIX shell without a UTF-8 locale).
 *
 * Panels keep writing Unicode; the translation happens once, where lines
 * become styled text, so no layout code knows about it. Every stand-in is
 * exactly one character wide: a translated line has the width of the
 * original, and nothing shifts.
 *
 * The Unicode symbols are limited to what both Consolas and Cascadia Mono
 * draw: the Windows console host has no font fallback, so a symbol missing
 * from its font (Consolas by default) shows as a boxed question mark — ◐◓◑◒
 * did, and the scan spinner looked frozen. Box drawing, the shade and half
 * blocks, basic arrows and shapes are safe; ✔ ✖ ⚠, Braille, the eighth
 * blocks and most of the Geometric Shapes and Dingbats blocks are not. The
 * glyph tests hold every symbol gup draws to that repertoire.
 */

export type GlyphMode = "unicode" | "ascii";
export type GlyphPreference = "auto" | GlyphMode;

/** Status marks shared by every view (scan, run, journal, schedules, providers). */
export const STATUS_GLYPHS = Object.freeze({
  success: "√",
  failed: "×",
  warning: "‼",
  skipped: "→",
  cancelled: "▪",
  /** A run that updated some of its packages and failed others. */
  partial: "±",
  pending: "·",
  /** A line turning a quarter per frame; `| / - \` in ASCII. */
  running: Object.freeze(["│", "╱", "─", "╲"]),
  scan: "◌",
  scheduled: "∞",
  incompatible: "–",
  enabled: "●",
  disabled: "○",
});

/**
 * Unicode → ASCII, one character each. Keys are every non-letter symbol a
 * terminal-rendered string of gup may contain; the guard test fails when a
 * string literal under `src/ui/` holds a symbol missing from here.
 */
const ASCII_OF: Readonly<Record<string, string>> = Object.freeze({
  // Typography
  "·": ".",
  "•": "*",
  "…": ".",
  "–": "-",
  "—": "-",
  "−": "-",
  "«": '"',
  "»": '"',
  "“": '"',
  "”": '"',
  "×": "x",
  "≤": "<",
  "≥": ">",
  "≈": "~",
  "≠": "#",
  "‖": "|",
  "°": "o",
  // Arrows and pointers
  "←": "<",
  "↑": "^",
  "→": ">",
  "↓": "v",
  "↔": "-",
  "↗": "/",
  "↷": "~",
  "↻": "@",
  "⇄": "=",
  "⇒": ">",
  "⇔": "=",
  "⇢": ">",
  "⟳": "@",
  "›": ">",
  "❯": ">",
  "▸": ">",
  "▶": ">",
  "◀": "<",
  "▴": "^",
  "▲": "^",
  "▾": "v",
  "▼": "v",
  // Status marks
  "√": "+",
  "‼": "!",
  "±": "~",
  "∞": "*",
  "✔": "+",
  "✓": "+",
  "✖": "x",
  "⚠": "!",
  "⊘": "/",
  "◷": "*",
  "●": "*",
  "○": "o",
  "◍": "o",
  "◇": "o",
  "◊": "o",
  "◌": "@",
  "▪": "/",
  "◐": "|",
  "◓": "/",
  "◑": "-",
  "◒": "\\",
  "⠿": "*",
  "★": "*",
  "⏭": ">",
  "⌨": ">",
  "⧉": "#",
  "⎙": "#",
  // Check boxes
  "■": "x",
  "□": "?",
  "▢": "?",
  "▣": "x",
  "▤": "=",
  "☑": "x",
  "⊞": "+",
  // Blocks: bars, spark lines, heat maps
  "█": "#",
  "▉": "#",
  "▊": "#",
  "▋": "#",
  "▍": "#",
  "▎": "#",
  "▏": "#",
  "▌": "|",
  "▐": "|",
  "░": ".",
  "▒": ":",
  "▓": "+",
  "▁": "_",
  "▂": "_",
  "▃": ".",
  "▄": "-",
  "▅": "~",
  "▆": "=",
  "▇": "^",
  // Box drawing
  "─": "-",
  "━": "=",
  "═": "=",
  "│": "|",
  "┃": "|",
  "║": "|",
  "╭": "+",
  "╮": "+",
  "╰": "+",
  "╯": "+",
  "┌": "+",
  "┐": "+",
  "└": "+",
  "┘": "+",
  "┏": "+",
  "┓": "+",
  "┗": "+",
  "┛": "+",
  "╔": "+",
  "╗": "+",
  "╚": "+",
  "╝": "+",
  "├": "+",
  "┤": "+",
  "┬": "+",
  "┴": "+",
  "┼": "+",
  "┷": "+",
  "╱": "/",
  "╲": "\\",
});

/** Box borders in ASCII mode: idle `+-|`, focused `*=|` — focus still reads without colour. */
export const ASCII_BORDER_CHARS: Readonly<{ idle: BorderCharacters; focus: BorderCharacters }> =
  Object.freeze({
    idle: borderOf({ corner: "+", horizontal: "-", vertical: "|" }),
    focus: borderOf({ corner: "*", horizontal: "=", vertical: "|" }),
  });

function borderOf(parts: {
  readonly corner: string;
  readonly horizontal: string;
  readonly vertical: string;
}): BorderCharacters {
  const { corner, horizontal, vertical } = parts;
  return Object.freeze({
    topLeft: corner,
    topRight: corner,
    bottomLeft: corner,
    bottomRight: corner,
    horizontal,
    vertical,
    topT: corner,
    bottomT: corner,
    leftT: corner,
    rightT: corner,
    cross: corner,
  });
}

/** `text` with every mapped symbol replaced by its stand-in; same length, letters untouched. */
export function toAscii(text: string): string {
  let out = "";
  for (const char of text) out += ASCII_OF[char] ?? char;
  return out;
}

const UTF8_LOCALE = /utf-?8/i;
const ASCII_TERMS = new Set(["linux", "dumb"]);

/**
 * The glyph set to draw with. `auto` picks ASCII when the user asked for it
 * (`GUP_ASCII=1`), on a terminal known to lack the symbols (`TERM=linux`, the
 * VT console; `TERM=dumb`), and on POSIX when the effective locale is not
 * UTF-8 — `LC_ALL`, then `LC_CTYPE`, then `LANG`, the first one set wins.
 * Windows consoles render the symbols with their default fonts.
 */
export function resolveGlyphMode(
  preference: GlyphPreference,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): GlyphMode {
  if (preference !== "auto") return preference;
  if (env["GUP_ASCII"] === "1") return "ascii";
  if (ASCII_TERMS.has(env["TERM"] ?? "")) return "ascii";
  if (platform !== "win32" && !UTF8_LOCALE.test(effectiveLocale(env))) return "ascii";
  return "unicode";
}

function effectiveLocale(env: NodeJS.ProcessEnv): string {
  for (const name of ["LC_ALL", "LC_CTYPE", "LANG"]) {
    const value = env[name];
    if (value) return value;
  }
  return "";
}
