import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  mix,
  parseHexColor,
  relativeLuminance,
  WCAG_MIN_CONTRAST,
  type Rgb,
} from "../contrast/wcag.js";

const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

describe("WCAG contrast oracle", () => {
  it("spans 1:1 to 21:1, whatever the order of the colours", () => {
    expect(contrastRatio(BLACK, WHITE)).toBe(21);
    expect(contrastRatio(WHITE, BLACK)).toBe(21);
    expect(contrastRatio(WHITE, WHITE)).toBe(1);
  });

  // Reference values published with WCAG tooling (WebAIM's checker among
  // them): #767676 is the lightest grey passing AA on white, #777 the darkest
  // failing it, #595959 the lightest passing AAA. CSS blue, red and green pin
  // each channel's weight end to end, hex parsing included.
  it.each([
    ["#767676", 4.54],
    ["#777", 4.48],
    ["#595959", 7.0],
    ["#0000ff", 8.59],
    ["#ff0000", 4.0],
    ["#008000", 5.14],
  ])("measures %s on white at %f:1", (color, expected) => {
    expect(contrastRatio(parseHexColor(color), WHITE)).toBeCloseTo(expected, 2);
  });

  it("puts the AA edge exactly where WCAG does", () => {
    expect(contrastRatio(parseHexColor("#767676"), WHITE)).toBeGreaterThanOrEqual(
      WCAG_MIN_CONTRAST.text,
    );
    expect(contrastRatio(parseHexColor("#777777"), WHITE)).toBeLessThan(WCAG_MIN_CONTRAST.text);
  });

  it("weighs green most and blue least in relative luminance", () => {
    expect(relativeLuminance(WHITE)).toBe(1);
    expect(relativeLuminance(BLACK)).toBe(0);
    expect(relativeLuminance([0, 255, 0])).toBeCloseTo(0.7152, 4);
    expect(relativeLuminance([0, 0, 255])).toBeCloseTo(0.0722, 4);
  });

  it("uses the linear segment below the sRGB threshold", () => {
    expect(relativeLuminance([10, 10, 10])).toBeCloseTo(10 / 255 / 12.92, 10);
  });

  it("refuses values that are not 8-bit sRGB", () => {
    expect(() => relativeLuminance([256, 0, 0])).toThrow(RangeError);
    expect(() => relativeLuminance([0.5, 0, 0])).toThrow(RangeError);
  });
});

describe("hex colours", () => {
  it("parses #rgb and #rrggbb in any case", () => {
    expect(parseHexColor("#abc")).toEqual([170, 187, 204]);
    expect(parseHexColor("#0D1117")).toEqual([13, 17, 23]);
  });

  it.each(["0d1117", "#12345", "#ggg", "rgb(0,0,0)", ""])("refuses %j", (value) => {
    expect(() => parseHexColor(value)).toThrow(SyntaxError);
  });
});

describe("mix", () => {
  it("moves a colour toward another, rounded per channel", () => {
    expect(mix(WHITE, BLACK, 0)).toEqual(WHITE);
    expect(mix(WHITE, BLACK, 1)).toEqual(BLACK);
    expect(mix(WHITE, BLACK, 0.5)).toEqual([128, 128, 128]);
    expect(mix([10, 20, 30], [20, 40, 60], 0.25)).toEqual([13, 25, 38]);
  });

  it("refuses an amount outside [0, 1]", () => {
    expect(() => mix(WHITE, BLACK, 1.5)).toThrow(RangeError);
    expect(() => mix(WHITE, BLACK, Number.NaN)).toThrow(RangeError);
  });
});
