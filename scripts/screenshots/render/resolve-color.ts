import type { RGBA } from "@opentui/core";
import type { Hex, TerminalPalette } from "./docs-palette.js";

/** Which side of a cell a colour paints: a transparent background is "no colour". */
export type ColorRole = "fg" | "bg";

/** The parts of an OpenTUI colour this module reads (tests build them directly). */
export type ColorLike = Pick<RGBA, "intent" | "slot" | "toInts">;

/** Slots the palette defines; above them, the xterm-256 cube and greys. */
const ANSI_SLOT_COUNT = 16;
const OPAQUE_ALPHA_MIN = 1;
const HEX_RADIX = 16;
const HEX_PAIR = 2;

/**
 * The colour a real terminal using `palette` would show, or null for "the
 * terminal's own background" (a transparent cell).
 *
 *  - indexed slot < 16 → `palette.ansi[slot]`: gup paints through ANSI slots,
 *    which the terminal maps through its theme;
 *  - indexed slot ≥ 16 → OpenTUI's xterm-256 value;
 *  - default → the palette's foreground, or the terminal background;
 *  - rgb with alpha 0 → same as default;
 *  - rgb → that exact colour. OpenTUI's implicit text colour is a literal
 *    #ffffff and stays literal: it is what the terminal really shows.
 */
export function resolveColor(
  color: ColorLike,
  role: ColorRole,
  palette: TerminalPalette,
): Hex | null {
  const terminalDefault = role === "fg" ? palette.foreground : null;
  if (color.intent === "default") return terminalDefault;
  if (color.intent === "indexed" && color.slot < ANSI_SLOT_COUNT) {
    return palette.ansi[color.slot] ?? terminalDefault;
  }
  const [r, g, b, alpha] = color.toInts();
  if (color.intent === "rgb" && alpha < OPAQUE_ALPHA_MIN) return terminalDefault;
  return toHex(r, g, b);
}

function toHex(...channels: readonly number[]): Hex {
  const digits = channels.map((value) => value.toString(HEX_RADIX).padStart(HEX_PAIR, "0"));
  return `#${digits.join("")}`;
}
