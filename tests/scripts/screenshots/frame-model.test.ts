import { RGBA, TextAttributes, type CapturedFrame, type CapturedSpan } from "@opentui/core";
import { describe, expect, it } from "vitest";
import { DOCS_PALETTE } from "../../../scripts/screenshots/render/docs-palette.js";
import { toFrameModel } from "../../../scripts/screenshots/render/frame-model.js";

interface SpanStyle {
  readonly fg?: RGBA;
  readonly bg?: RGBA;
  readonly attributes?: number;
  readonly width?: number;
}

function span(text: string, style: SpanStyle = {}): CapturedSpan {
  return {
    text,
    fg: style.fg ?? RGBA.fromValues(1, 1, 1, 1),
    bg: style.bg ?? RGBA.fromInts(0, 0, 0, 0),
    attributes: style.attributes ?? TextAttributes.NONE,
    width: style.width ?? text.length,
  };
}

function frameOf(...spans: CapturedSpan[]): CapturedFrame {
  const cols = spans.reduce((total, { width }) => total + width, 0);
  return { cols, rows: 1, cursor: [0, 0], lines: [{ spans }] };
}

function firstSpan(frame: CapturedFrame) {
  return toFrameModel(frame, DOCS_PALETTE).lines[0]?.[0];
}

describe("toFrameModel", () => {
  it("swaps the resolved colours under INVERSE, no background becoming the palette's", () => {
    const inverse = span("x", { fg: RGBA.fromIndex(2), attributes: TextAttributes.INVERSE });
    expect(firstSpan(frameOf(inverse))).toMatchObject({
      fg: DOCS_PALETTE.background,
      bg: DOCS_PALETTE.ansi[2],
    });
  });

  it("blanks hidden text but keeps its background", () => {
    const hidden = span("secret", { bg: RGBA.fromIndex(4), attributes: TextAttributes.HIDDEN });
    expect(firstSpan(frameOf(hidden))).toMatchObject({ text: "      ", bg: DOCS_PALETTE.ansi[4] });
  });

  it("starts each span after the cells of the previous ones, a wide glyph taking two", () => {
    const model = toFrameModel(frameOf(span("ab"), span("界", { width: 2 }), span("c")), DOCS_PALETTE);
    expect(model.lines[0]?.map(({ text, col, width }) => [text, col, width])).toEqual([
      ["ab", 0, 2],
      ["界", 2, 2],
      ["c", 4, 1],
    ]);
  });

  it("decodes bold, dim, italic, underline and strikethrough", () => {
    const { BOLD, DIM, ITALIC, UNDERLINE, STRIKETHROUGH } = TextAttributes;
    const flags = (attributes: number) => {
      const decoded = firstSpan(frameOf(span("x", { attributes })));
      return [decoded?.isBold, decoded?.isDim, decoded?.isItalic, decoded?.isUnderline, decoded?.isStrikethrough];
    };
    expect(flags(BOLD | ITALIC | STRIKETHROUGH)).toEqual([true, false, true, false, true]);
    expect(flags(DIM | UNDERLINE)).toEqual([false, true, false, true, false]);
  });
});
