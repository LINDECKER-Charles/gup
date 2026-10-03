import type { RGBA } from "@opentui/core";
import type { Tui } from "../../tui/load-tui.js";
import type { Fill, Tone } from "../../tui/styled-lines.js";
import type { BorderLook, ChunkStyle, InputLook } from "../appearance.js";
import { ASCII_BORDER_CHARS, type GlyphMode } from "../glyphs.js";
import type { ColorRef, TextStyle, ThemePaint } from "../style-table.js";

/**
 * A theme's paint as OpenTUI values, for one resolve: chunk styles, borders,
 * background and text field. The only place that builds an `RGBA` from a
 * theme; the values are made once and reused for every chunk.
 *
 * Focus never rests on colour alone (WCAG 1.4.1): the focused panel is
 * drawn heavy, the others rounded — in ASCII mode with `*=|` against `+-|`.
 */
export class ScreenLook {
  readonly #tui: Tui;
  readonly #paint: ThemePaint;
  readonly #glyphMode: GlyphMode;
  readonly #styles = new Map<string, ChunkStyle>();

  constructor(tui: Tui, paint: ThemePaint, glyphMode: GlyphMode) {
    this.#tui = tui;
    this.#paint = paint;
    this.#glyphMode = glyphMode;
  }

  style(tone: Tone, fill?: Fill): ChunkStyle {
    const key = `${tone}/${fill ?? "none"}`;
    const cached = this.#styles.get(key);
    if (cached) return cached;
    const style = this.#chunkStyle(this.#paint.text[tone][fill ?? "none"]);
    this.#styles.set(key, style);
    return style;
  }

  border(isFocused: boolean): BorderLook {
    const { border, title } = this.#paint;
    const isAscii = this.#glyphMode === "ascii";
    return {
      color: this.#rgba(isFocused ? border.focus : border.idle),
      style: isFocused ? "heavy" : "rounded",
      titleColor: this.#rgba(title),
      ...(isAscii && {
        customChars: isFocused ? ASCII_BORDER_CHARS.focus : ASCII_BORDER_CHARS.idle,
      }),
    };
  }

  background(): RGBA | "transparent" {
    const { background } = this.#paint;
    return background ? this.#rgba(background) : "transparent";
  }

  input(): InputLook {
    const { input } = this.#paint;
    const { TextAttributes } = this.#tui;
    return {
      textColor: this.#rgba(input.text),
      backgroundColor: input.background ? this.#rgba(input.background) : "transparent",
      placeholderColor: this.#rgba(input.placeholder),
      cursorColor: this.#rgba(input.cursor),
      attributes: input.isInverse ? TextAttributes.INVERSE : TextAttributes.NONE,
    };
  }

  #chunkStyle(style: TextStyle): ChunkStyle {
    const { TextAttributes } = this.#tui;
    const attributes =
      (style.isBold ? TextAttributes.BOLD : 0) |
      (style.isDim ? TextAttributes.DIM : 0) |
      (style.isInverse ? TextAttributes.INVERSE : 0);
    return {
      fg: this.#rgba(style.fg),
      ...(style.bg && { bg: this.#rgba(style.bg) }),
      attributes,
    };
  }

  /** A palette slot or a terminal default keeps its known RGB as a snapshot (for audits). */
  #rgba(ref: ColorRef): RGBA {
    const { RGBA } = this.#tui;
    const snapshot = ref.rgb ? RGBA.fromInts(ref.rgb.r, ref.rgb.g, ref.rgb.b) : undefined;
    switch (ref.kind) {
      case "rgb":
        return RGBA.fromInts(ref.rgb.r, ref.rgb.g, ref.rgb.b);
      case "slot":
        return RGBA.fromIndex(ref.slot, snapshot);
      case "terminal-fg":
        return RGBA.defaultForeground(snapshot);
      case "terminal-bg":
        return RGBA.defaultBackground(snapshot);
    }
  }
}
