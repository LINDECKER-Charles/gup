import { describe, expect, it } from "vitest";
import { barText } from "../../../src/ui/charts/bar-chart.js";
import { chartGlyphs } from "../../../src/ui/charts/chart-glyphs.js";
import { barSteps, quantileLevels, resample } from "../../../src/ui/charts/scale.js";
import { sparkline } from "../../../src/ui/charts/sparkline.js";

const UNICODE = chartGlyphs("unicode");
const ASCII = chartGlyphs("ascii");

describe("quantileLevels", () => {
  it("keeps 0 at level 0 and spreads the other values over the quartiles", () => {
    const level = quantileLevels([0, 1, 2, 3, 4, 0], 5);
    expect([0, 1, 2, 3, 4].map(level)).toEqual([0, 1, 2, 3, 4]);
  });

  it("does not let one busy day push every other day to the lowest level", () => {
    const level = quantileLevels([1, 1, 2, 2, 3, 3, 40], 5);
    expect(level(3)).toBeGreaterThan(level(1));
    expect(level(40)).toBe(4);
  });

  it("keeps the levels apart when most days share the same count", () => {
    const days = [...Array<number>(50).fill(1), ...Array<number>(20).fill(2), ...Array<number>(10).fill(3), 4, 4, 8];
    const level = quantileLevels(days, 5);

    expect([1, 2, 3, 4, 8].map(level)).toEqual([1, 1, 2, 3, 4]);
  });

  it("gives every value the first level when nothing else is known", () => {
    expect(quantileLevels([], 5)(7)).toBe(1);
  });
});

describe("bars", () => {
  it("fills its share of the steps, at least one for any value", () => {
    expect(barSteps(1, 2, 32)).toBe(16);
    expect(barSteps(1, 1000, 32)).toBe(1);
    expect(barSteps(0, 10, 32)).toBe(0);
  });

  it("draws whole blocks then the half block that ends the bar, padded to its width", () => {
    expect(barText({ value: 24, max: 24, cells: 5 }, UNICODE)).toBe("█████");
    expect(barText({ value: 7, max: 24, cells: 5 }, UNICODE)).toBe("█▌   ");
    expect(barText({ value: 9, max: 24, cells: 5 }, UNICODE)).toBe("██   ");
    expect(barText({ value: 1, max: 100, cells: 5 }, UNICODE)).toBe("▌    ");
    expect(barText({ value: 0, max: 24, cells: 3 }, UNICODE)).toBe("   ");
  });

  it("rounds to whole cells in ASCII, a non-zero value still showing", () => {
    expect(barText({ value: 9, max: 24, cells: 5 }, ASCII)).toBe("##   ");
    expect(barText({ value: 1, max: 100, cells: 5 }, ASCII)).toBe("#    ");
  });
});

describe("sparkline", () => {
  it("draws one level per point, from zero to the series' maximum", () => {
    expect(sparkline([0, 7, 14], 10, UNICODE)).toBe("_▄█");
    expect(sparkline([0, 7, 14], 10, ASCII)).toBe("_~^");
  });

  it("draws a flat series of zeros at the lowest level", () => {
    expect(sparkline([0, 0, 0], 10, UNICODE)).toBe("___");
  });

  it("resamples a long series to the width by bucket means", () => {
    expect(resample([1, 3, 5, 7], 2)).toEqual([2, 6]);
    expect(resample([1, 2], 5)).toEqual([1, 2]);
    expect(sparkline(Array.from({ length: 100 }, (_unused, index) => index), 20, UNICODE)).toHaveLength(20);
  });
});
