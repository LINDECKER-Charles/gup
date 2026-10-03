import chalk from "chalk";
import { toAscii, type GlyphMode } from "../theme/glyphs.js";
import type { Line, Tone } from "../tui/styled-lines.js";

/**
 * Styled lines for output outside the full screen (`gup report --format
 * text`, `gup log`): each tone becomes a chalk style, which chalk drops on
 * its own when stdout is not a terminal. In ASCII mode every symbol is
 * translated, as the screen's appearance does in the TUI.
 */

const PAINT: Readonly<Record<Tone, (text: string) => string>> = {
  plain: (text) => text,
  strong: (text) => chalk.bold(text),
  muted: (text) => chalk.dim(text),
  disabled: (text) => chalk.gray(text),
  accent: (text) => chalk.cyan(text),
  success: (text) => chalk.green(text),
  warning: (text) => chalk.yellow(text),
  danger: (text) => chalk.red(text),
  onAccent: (text) => chalk.inverse(text),
};

/** One line as terminal text, trailing spaces dropped. */
export function lineToAnsi(line: Line, mode: GlyphMode = "unicode"): string {
  const glyphs = mode === "ascii" ? toAscii : (text: string) => text;
  return line
    .map((segment) => PAINT[segment.tone](glyphs(segment.text)))
    .join("")
    .trimEnd();
}

/** Lines as terminal text, each ending with a line break. */
export function linesToAnsi(lines: readonly Line[], mode: GlyphMode): string {
  return lines.map((line) => `${lineToAnsi(line, mode)}\n`).join("");
}

/** Lines as plain text (a file), each ending with a line break. */
export function linesToText(lines: readonly Line[], mode: GlyphMode): string {
  const glyphs = mode === "ascii" ? toAscii : (text: string) => text;
  return lines
    .map((line) => `${glyphs(line.map((segment) => segment.text).join("")).trimEnd()}\n`)
    .join("");
}
