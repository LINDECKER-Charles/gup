import { describe, expect, it } from "vitest";
import { DOCS_PALETTE } from "../../../scripts/screenshots/render/docs-palette.js";
import type { FrameModel, FrameSpan } from "../../../scripts/screenshots/render/frame-model.js";
import { renderSvg, type SvgOptions } from "../../../scripts/screenshots/render/svg-frame.js";

const OPTIONS: SvgOptions = {
  title: "gup — Paquets",
  description: "The Paquets view.",
  palette: DOCS_PALETTE,
};

function frameSpan(text: string, col: number, style: Partial<FrameSpan> = {}): FrameSpan {
  return {
    text,
    col,
    width: text.length,
    fg: "#e6edf3",
    bg: null,
    isBold: false,
    isDim: false,
    isItalic: false,
    isUnderline: false,
    isStrikethrough: false,
    ...style,
  };
}

function frameOf(lines: FrameSpan[][], cols = 20): FrameModel {
  return { cols, rows: lines.length, lines };
}

function elements(svg: string, name: string): string[] {
  return svg.split("\n").filter((line) => line.startsWith(`<${name} `));
}

describe("renderSvg", () => {
  it("locks every span to its cells: x from the column, length from the width", () => {
    const svg = renderSvg(frameOf([[], [frameSpan("Git", 3)]]), OPTIONS);
    expect(elements(svg, "text").at(-1)).toContain('x="39.4" y="72.0" textLength="23.4"');
  });

  it("escapes markup in the text, the title and the alt text", () => {
    const svg = renderSvg(frameOf([[frameSpan("<b> & </b>", 0)]]), {
      ...OPTIONS,
      title: "a<b",
      description: "c&d",
    });
    expect(svg).toContain(">&lt;b&gt; &amp; &lt;/b&gt;</text>");
    expect(svg).toContain('<title id="t">a&lt;b</title>');
    expect(svg).toContain('<desc id="d">c&amp;d</desc>');
    expect(svg).not.toContain("<b>");
  });

  it("paints a background only behind opaque cells, one rect per run of a colour", () => {
    const line = [
      frameSpan("ab", 0),
      frameSpan("cd", 2, { bg: "#ff0000" }),
      frameSpan("ef", 4, { bg: "#ff0000", fg: "#000000" }),
      frameSpan("gh", 6, { bg: "#00ff00" }),
    ];
    const rects = elements(renderSvg(frameOf([line]), OPTIONS), "rect").filter((rect) =>
      rect.includes('class="'),
    );
    expect(rects.map((rect) => rect.match(/x="[\d.]+" .* width="[\d.]+"/)?.[0])).toEqual([
      'x="31.6" y="42.0" width="31.2"',
      'x="62.8" y="42.0" width="15.6"',
    ]);
  });

  it("styles text through classes: colours numbered by first use, attributes as flags", () => {
    const line = [
      frameSpan("a", 0, { fg: "#aaaaaa", isBold: true }),
      frameSpan("b", 1, { fg: "#bbbbbb", isDim: true, isUnderline: true, isStrikethrough: true }),
      frameSpan("c", 2, { fg: "#aaaaaa", isItalic: true }),
    ];
    const svg = renderSvg(frameOf([line]), OPTIONS);
    expect(elements(svg, "text").slice(1).map((text) => text.match(/class="([^"]+)"/)?.[1])).toEqual(
      ["c0 b", "c1 us d", "c0 i"],
    );
    expect(svg.indexOf(".c0{fill:#aaaaaa}")).toBeLessThan(svg.indexOf(".c1{fill:#bbbbbb}"));
  });

  it("draws no text for blank cells unless a line runs through them", () => {
    const line = [frameSpan("   ", 0), frameSpan("   ", 3, { isUnderline: true })];
    expect(elements(renderSvg(frameOf([line]), OPTIONS), "text")).toHaveLength(2);
  });

  it("renders the same frame to the same bytes, LF-only with a final newline", () => {
    const frame = frameOf([[frameSpan("same", 0, { bg: "#123456" })]]);
    const svg = renderSvg(frame, OPTIONS);
    expect(renderSvg(frame, OPTIONS)).toBe(svg);
    expect(svg.endsWith("</svg>\n")).toBe(true);
    expect(svg).not.toContain("\r");
  });

  it("sizes the document from the grid and labels it for assistive technology", () => {
    const svg = renderSvg(frameOf(Array.from({ length: 28 }, () => []), 100), OPTIONS);
    expect(svg.split("\n")[0]).toContain('width="812.0" height="526.0" role="img" aria-labelledby="t d"');
    expect(svg).toContain('<title id="t">gup — Paquets</title>');
    expect(svg).toContain('<desc id="d">The Paquets view.</desc>');
  });
});
