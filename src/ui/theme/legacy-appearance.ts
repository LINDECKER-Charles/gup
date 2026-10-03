import type { RGBA } from "@opentui/core";
import type { Tui } from "../tui/load-tui.js";
import type { Fill, Tone } from "../tui/styled-lines.js";
import type { Appearance, AppearanceFactory, ChunkStyle, InputLook } from "./appearance.js";
import { ASCII_BORDER_CHARS, resolveGlyphMode, toAscii, type GlyphMode } from "./glyphs.js";

/**
 * gup's look without a theme engine: ANSI palette slots rather than RGB
 * values, so the terminal maps them through its own theme, exactly like chalk
 * does for the rest of gup's output. OpenTUI's named colors are fixed RGB
 * (`cyan` is #00FFFF), unreadable on a light theme. Tones without a slot keep
 * OpenTUI's default colour; the text field keeps OpenTUI's own defaults.
 */
const FG_SLOT: Partial<Record<Tone, number>> = {
  accent: 6,
  success: 2,
  warning: 3,
  danger: 1,
  onAccent: 0,
};
const BG_SLOT: Readonly<Record<Fill, number>> = { accent: 6, highlight: 8 };
const BORDER_SLOT = { idle: 8, focus: 6 } as const;
const BOLD_TONES: ReadonlySet<Tone> = new Set(["strong", "onAccent"]);
/** `disabled` reads like `muted` until a theme gives it its own colour. */
const DIM_TONES: ReadonlySet<Tone> = new Set(["muted", "disabled"]);
const INPUT_TEXT_RGB = [255, 255, 255] as const;
const INPUT_PLACEHOLDER_RGB = [0x66, 0x66, 0x66] as const;

export const legacyAppearance: AppearanceFactory = (_renderer, tui) =>
  createLegacyAppearance(tui, resolveGlyphMode("auto"));

function createLegacyAppearance(tui: Tui, glyphMode: GlyphMode): Appearance {
  const styles = new Map<string, ChunkStyle>();
  const slot = (index: number): RGBA => tui.RGBA.fromIndex(index);
  return {
    glyphMode,
    density: "comfortable",
    style(tone, fill) {
      const key = `${tone}/${fill ?? ""}`;
      const cached = styles.get(key) ?? paint(tui, tone, fill);
      styles.set(key, cached);
      return cached;
    },
    border: (isFocused) => ({
      color: slot(isFocused ? BORDER_SLOT.focus : BORDER_SLOT.idle),
      style: "rounded",
      ...(glyphMode === "ascii" && {
        customChars: isFocused ? ASCII_BORDER_CHARS.focus : ASCII_BORDER_CHARS.idle,
      }),
    }),
    background: () => "transparent",
    input: () => inputLook(tui),
    glyphs: (text) => (glyphMode === "ascii" ? toAscii(text) : text),
    onChange: () => () => {},
  };
}

function paint(tui: Tui, tone: Tone, fill: Fill | undefined): ChunkStyle {
  const fg = FG_SLOT[tone];
  return {
    ...(fg !== undefined && { fg: tui.RGBA.fromIndex(fg) }),
    ...(fill && { bg: tui.RGBA.fromIndex(BG_SLOT[fill]) }),
    attributes: attributesOf(tui, tone),
  };
}

function attributesOf(tui: Tui, tone: Tone): number {
  if (BOLD_TONES.has(tone)) return tui.TextAttributes.BOLD;
  if (DIM_TONES.has(tone)) return tui.TextAttributes.DIM;
  return tui.TextAttributes.NONE;
}

function inputLook(tui: Tui): InputLook {
  const white = tui.RGBA.fromInts(...INPUT_TEXT_RGB);
  return {
    textColor: white,
    backgroundColor: "transparent",
    placeholderColor: tui.RGBA.fromInts(...INPUT_PLACEHOLDER_RGB),
    cursorColor: white,
    attributes: tui.TextAttributes.NONE,
  };
}
