import { TextAttributes, type CapturedFrame, type CapturedSpan } from "@opentui/core";
import * as wcag from "../contrast/wcag.js";

/**
 * The contrast of what is actually on screen: every captured span of a
 * frame, its foreground against the ground it sits on (its own background
 * when painted, else the theme's background), measured with the independent
 * WCAG oracle. Text must reach 4.5:1 (or the AAA 7:1), box drawing 3:1 —
 * whatever code path painted it, so a chunk painted outside the theme fails
 * here.
 */

export interface ContrastViolation {
  readonly text: string;
  readonly ratio: number;
  readonly needed: number;
}

export interface FrameContrastOptions {
  /** What shows through an unpainted cell: the terminal's (or the theme's) background. */
  readonly ground: wcag.Rgb;
  /**
   * What a cell painted in the terminal's default foreground shows — its
   * text colour — when the frame did not capture it (monochrome, trusted
   * modes paint the default without knowing it). Default: the captured value.
   */
  readonly ink?: wcag.Rgb;
  /** Text minimum; default AA (4.5). */
  readonly textMinimum?: number;
}

/** U+2500–U+257F (box drawing), plus the ASCII stand-ins of the ASCII mode borders. */
const BORDER_ONLY = /^[─-╿+\-|*=]+$/u;

function rgbOf(color: CapturedSpan["fg"]): wcag.Rgb {
  const [r, g, b] = color.toInts();
  return [r, g, b];
}

/**
 * A cell shows `ground` when nothing is painted behind it, and when what is
 * painted is the terminal's own default background (a dialog over a screen
 * that paints none): its captured RGB is only OpenTUI's placeholder then.
 * Likewise its text shows `ink`, when given, in the default foreground.
 */
function inkAndGround(span: CapturedSpan, options: FrameContrastOptions): [wcag.Rgb, wcag.Rgb] {
  const ink = span.fg.intent === "default" && options.ink ? options.ink : rgbOf(span.fg);
  const isGround = span.bg.a === 0 || span.bg.intent === "default";
  const behind = isGround ? options.ground : rgbOf(span.bg);
  const isInverse = (span.attributes & TextAttributes.INVERSE) !== 0;
  return isInverse ? [behind, ink] : [ink, behind];
}

export function frameContrastViolations(
  frame: CapturedFrame,
  options: FrameContrastOptions,
): ContrastViolation[] {
  const textMinimum = options.textMinimum ?? wcag.WCAG_MIN_CONTRAST.text;
  return frame.lines.flatMap((line) =>
    line.spans.flatMap((span) => {
      const visible = span.text.replace(/\s/gu, "");
      if (visible === "") return [];
      const [ink, behind] = inkAndGround(span, options);
      const ratio = wcag.contrastRatio(ink, behind);
      const needed = BORDER_ONLY.test(visible) ? wcag.WCAG_MIN_CONTRAST.nonText : textMinimum;
      return ratio >= needed ? [] : [{ text: span.text, ratio, needed }];
    }),
  );
}
