import type { Hex, TerminalPalette } from "./docs-palette.js";
import type { FrameModel, FrameSpan } from "./frame-model.js";

export interface SvgOptions {
  /** Window title and `<title>`: "gup — Packages". */
  readonly title: string;
  /** `<desc>`: the scene's alt text. */
  readonly description: string;
  readonly palette: TerminalPalette;
}

/** 100 columns → 812 px: fits GitHub's README column without scaling. */
const CELL_WIDTH = 7.8;
/** Same row pitch as `docs/assets/demo.svg`. */
const ROW_HEIGHT = 17;
/** Box-drawing `│` stays continuous at 16 px on 17 px rows (it breaks into dashes at 13 px). */
const FONT_SIZE = 16;
/** Baseline offset inside a row. */
const BASELINE = 13;
const PADDING_X = 16;
const PADDING_Y = 8;
/** Window decoration, same as `docs/assets/demo.svg`. */
const TITLE_BAR = 34;
const TITLE_FONT_SIZE = 12;
const TITLE_BASELINE = 21;
const CORNER_RADIUS = 10;
const TRAFFIC_LIGHTS = ["#ff5f57", "#febc2e", "#28c840"] as const;
const TRAFFIC_LIGHT_X = 22;
const TRAFFIC_LIGHT_STEP = 18;
const TRAFFIC_LIGHT_RADIUS = 5.5;
/** Dim text: #e6edf3 lands on #939a9f over the dark background, 6.4:1. */
const DIM_OPACITY = 0.62;
const FONT_STACK =
  'ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,"DejaVu Sans Mono",monospace';
const DECIMALS = 1;
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

const XML_ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
/** Characters XML 1.0 forbids in a document: never expected in a frame, never emitted. */
const XML_FORBIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g;

type Attributes = ReadonlyArray<readonly [name: string, value: string | number]>;

interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * A standalone SVG terminal screenshot: window chrome, then every cell on a
 * fixed grid. Deterministic — the same frame always gives the same bytes:
 * colour classes are numbered by first use, numbers have one decimal, one
 * element per line (readable diffs), LF endings and a trailing newline. No
 * script, no external reference, no animation.
 */
export function renderSvg(frame: FrameModel, options: SvgOptions): string {
  const size = documentSize(frame);
  const colors = new ColorClasses();
  const backgrounds = frame.lines.flatMap((spans, row) => backgroundRects(spans, row, colors));
  const texts = frame.lines.flatMap((spans, row) => textElements(spans, row, colors));
  const root: Attributes = [
    ["xmlns", SVG_NAMESPACE],
    ["viewBox", `0 0 ${fixed(size.width)} ${fixed(size.height)}`],
    ["width", size.width],
    ["height", size.height],
    ["role", "img"],
    ["aria-labelledby", "t d"],
  ];
  return [
    openTag("svg", root),
    tag("title", [["id", "t"]], escapeXml(options.title)),
    tag("desc", [["id", "d"]], escapeXml(options.description)),
    ...styleSheet(options.palette, colors),
    ...windowChrome(size, options),
    // Every background first: a glyph's descender may reach into the next row.
    ...backgrounds,
    ...texts,
    "</svg>",
    "",
  ].join("\n");
}

function documentSize(frame: FrameModel): Size {
  return {
    width: 2 * PADDING_X + frame.cols * CELL_WIDTH,
    height: TITLE_BAR + 2 * PADDING_Y + frame.rows * ROW_HEIGHT,
  };
}

/** `.c0`, `.c1`… fill classes, numbered in the order colours are first used. */
class ColorClasses {
  readonly #byColor = new Map<Hex, string>();

  classOf(color: Hex): string {
    const known = this.#byColor.get(color);
    if (known) return known;
    const name = `c${this.#byColor.size}`;
    this.#byColor.set(color, name);
    return name;
  }

  rules(): string[] {
    return [...this.#byColor].map(([color, name]) => `.${name}{fill:${color}}`);
  }
}

function styleSheet(palette: TerminalPalette, colors: ColorClasses): string[] {
  return [
    "<style>",
    `text{font-family:${FONT_STACK};font-size:${FONT_SIZE}px}`,
    `.t{font-size:${TITLE_FONT_SIZE}px;letter-spacing:.4px;fill:${palette.chrome.title}}`,
    ".b{font-weight:700}",
    ".i{font-style:italic}",
    ".u{text-decoration:underline}",
    ".s{text-decoration:line-through}",
    ".us{text-decoration:underline line-through}",
    `.d{opacity:${DIM_OPACITY}}`,
    ...colors.rules(),
    "</style>",
  ];
}

/** The window around the frame: background, then the title bar. */
function windowChrome(size: Size, options: SvgOptions): string[] {
  const { chrome, background } = options.palette;
  const { width, height } = size;
  const rounded: Attributes = [["rx", CORNER_RADIUS]];
  const barBottom = TITLE_BAR - CORNER_RADIUS;
  return [
    tag("rect", [...box(0, width, height), ...rounded, ["fill", background]]),
    tag("rect", [...box(0, width, TITLE_BAR), ...rounded, ["fill", chrome.bar]]),
    // Square off the bar's rounded bottom corners.
    tag("rect", [...box(barBottom, width, CORNER_RADIUS), ["fill", chrome.bar]]),
    tag("line", [
      ["x1", 0],
      ["y1", TITLE_BAR],
      ["x2", width],
      ["y2", TITLE_BAR],
      ["stroke", chrome.edge],
    ]),
    ...titleBar(size, options.title),
  ];
}

/** Traffic lights on the left, the title centred. */
function titleBar(size: Size, title: string): string[] {
  const lights = TRAFFIC_LIGHTS.map((color, index) =>
    tag("circle", [
      ["cx", TRAFFIC_LIGHT_X + index * TRAFFIC_LIGHT_STEP],
      ["cy", TITLE_BAR / 2],
      ["r", TRAFFIC_LIGHT_RADIUS],
      ["fill", color],
    ]),
  );
  const centred: Attributes = [
    ["class", "t"],
    ["x", size.width / 2],
    ["y", TITLE_BASELINE],
    ["text-anchor", "middle"],
  ];
  return [...lights, tag("text", centred, escapeXml(title))];
}

function box(y: number, width: number, height: number): Attributes {
  return [["y", y], ["width", width], ["height", height]];
}

/**
 * One rect per run of cells sharing a background, whatever their text
 * colours: adjacent rects would show anti-aliasing seams between them.
 */
function backgroundRects(spans: readonly FrameSpan[], row: number, colors: ColorClasses): string[] {
  const runs: Array<{ bg: Hex; col: number; width: number }> = [];
  for (const span of spans) {
    if (span.bg === null) continue;
    const last = runs.at(-1);
    if (last?.bg === span.bg && last.col + last.width === span.col) last.width += span.width;
    else runs.push({ bg: span.bg, col: span.col, width: span.width });
  }
  return runs.map(({ bg, col, width }) =>
    tag("rect", [
      ["class", colors.classOf(bg)],
      ["x", cellX(col)],
      ["y", rowTop(row)],
      ["width", width * CELL_WIDTH],
      ["height", ROW_HEIGHT],
    ]),
  );
}

/** One text element per visible span, stretched to its cells so any font stays on the grid. */
function textElements(spans: readonly FrameSpan[], row: number, colors: ColorClasses): string[] {
  return spans.filter(hasInk).map((span) =>
    tag(
      "text",
      [
        ["class", classesOf(span, colors)],
        ["x", cellX(span.col)],
        ["y", rowTop(row) + BASELINE],
        ["textLength", span.width * CELL_WIDTH],
        ["lengthAdjust", "spacingAndGlyphs"],
        ["xml:space", "preserve"],
      ],
      escapeXml(span.text),
    ),
  );
}

/** Blank text draws nothing, unless a line runs through it. */
function hasInk(span: FrameSpan): boolean {
  return span.text.trim() !== "" || span.isUnderline || span.isStrikethrough;
}

function classesOf(span: FrameSpan, colors: ColorClasses): string {
  const decoration = (span.isUnderline ? "u" : "") + (span.isStrikethrough ? "s" : "");
  return [
    colors.classOf(span.fg),
    ...(span.isBold ? ["b"] : []),
    ...(span.isItalic ? ["i"] : []),
    ...(decoration ? [decoration] : []),
    ...(span.isDim ? ["d"] : []),
  ].join(" ");
}

function cellX(col: number): number {
  return PADDING_X + col * CELL_WIDTH;
}

function rowTop(row: number): number {
  return TITLE_BAR + PADDING_Y + row * ROW_HEIGHT;
}

function openTag(name: string, attributes: Attributes): string {
  const rendered = attributes.map(([key, value]) => ` ${key}="${attributeValue(value)}"`);
  return `<${name}${rendered.join("")}>`;
}

/** `<name …/>`, or `<name …>content</name>` when there is content. */
function tag(name: string, attributes: Attributes, content?: string): string {
  const open = openTag(name, attributes);
  return content === undefined ? `${open.slice(0, -1)}/>` : `${open}${content}</${name}>`;
}

function attributeValue(value: string | number): string {
  return typeof value === "number" ? fixed(value) : value;
}

function fixed(value: number): string {
  return value.toFixed(DECIMALS);
}

function escapeXml(text: string): string {
  return text
    .replace(XML_FORBIDDEN, "�")
    .replace(/[&<>]/g, (char) => XML_ESCAPES[char] ?? char);
}
