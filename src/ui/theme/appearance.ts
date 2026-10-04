import type { BorderCharacters, BorderStyle, CliRenderer, RGBA } from "@opentui/core";
import type { Tui } from "../tui/load-tui.js";
import type { Fill, Tone } from "../tui/styled-lines.js";
import type { GlyphMode } from "./glyphs.js";

/**
 * How a screen looks: the one place that turns meaning (a {@link Tone}, a
 * {@link Fill}, a focused border) into colours, attributes, box characters and
 * glyphs. Panels, dialogs and bars only ever ask it; nothing else in the TUI
 * builds an `RGBA`. The foundation ships the legacy look (`legacy-appearance`);
 * a theme engine installs its own factory through `configureScreens`.
 */

/** Row spacing: blank separators and inner padding (comfortable), or none (compact). */
export type Density = "comfortable" | "compact";

/** Paint of one chunk of text. Absent colours leave OpenTUI's defaults. */
export interface ChunkStyle {
  readonly fg?: RGBA;
  readonly bg?: RGBA;
  /** `TextAttributes` bit set (BOLD, DIM, INVERSE…). */
  readonly attributes: number;
}

export interface BorderLook {
  readonly color: RGBA;
  readonly style: BorderStyle;
  /** Replaces the style's characters (ASCII mode). */
  readonly customChars?: BorderCharacters;
  /** Title colour; absent: the border colour. */
  readonly titleColor?: RGBA;
}

/** Paint of a text field (dialog input). */
export interface InputLook {
  readonly textColor: RGBA;
  readonly backgroundColor: RGBA | "transparent";
  readonly placeholderColor: RGBA;
  readonly cursorColor: RGBA;
  readonly attributes: number;
}

export interface Appearance {
  style(tone: Tone, fill?: Fill): ChunkStyle;
  border(isFocused: boolean): BorderLook;
  /** The screen's background: a colour gup paints, or the terminal's own. */
  background(): RGBA | "transparent";
  input(): InputLook;
  /** `text` in the screen's glyph set: identity in Unicode mode. */
  glyphs(text: string): string;
  readonly glyphMode: GlyphMode;
  readonly density: Density;
  /** Called when any answer above may have changed (theme preview, detection). */
  onChange(listener: () => void): () => void;
  /**
   * Settle what the appearance started on the terminal (palette queries),
   * awaited before the renderer is destroyed so no late reply reaches the shell.
   */
  dispose?(): Promise<void>;
}

/** Builds the appearance of one screen, once its renderer exists. */
export type AppearanceFactory = (renderer: CliRenderer, tui: Tui) => Appearance;
