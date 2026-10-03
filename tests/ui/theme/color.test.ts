import { describe, expect, it } from "vitest";
import { correctLightness } from "../../../src/ui/theme/color/contrast.js";
import { fromOklch, toOklch } from "../../../src/ui/theme/color/oklch.js";
import {
  nearestXterm256,
  quantizeWithin,
  xterm256Color,
} from "../../../src/ui/theme/color/quantize-256.js";
import {
  contrastRatio,
  formatRatio,
  mix,
  parseHex,
  relativeLuminance,
  rgb,
  toHex,
  type Rgb,
} from "../../../src/ui/theme/color/rgb.js";
import * as wcag from "../../support/contrast/wcag.js";
import { seededRandom } from "../../support/random.js";

/** The oracle's view of a colour: never the production maths. */
const tuple = (color: Rgb): wcag.Rgb => [color.r, color.g, color.b];
const oracleRatio = (a: Rgb, b: Rgb): number => wcag.contrastRatio(tuple(a), tuple(b));
const hex = (text: string): Rgb => {
  const color = parseHex(text);
  if (!color) throw new Error(`bad fixture ${text}`);
  return color;
};
const WHITE = hex("#FFFFFF");
const BLACK = hex("#000000");

function randomColor(random: () => number): Rgb {
  const channel = (): number => Math.floor(random() * 256);
  return rgb(channel(), channel(), channel());
}

function hueDistance(a: number, b: number): number {
  const distance = Math.abs(a - b) % 360;
  return Math.min(distance, 360 - distance);
}

describe("hex colours", () => {
  it("parses #rgb and #rrggbb in any case, and nothing else", () => {
    expect(parseHex("#abc")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
    expect(parseHex("#AABBCC")).toEqual({ r: 0xaa, g: 0xbb, b: 0xcc });
    expect(parseHex("#a1B2c3")).toEqual({ r: 0xa1, g: 0xb2, b: 0xc3 });
    for (const invalid of ["", "abc", "#ab", "#abcd", "#gggggg", "#aabbccdd", " #aabbcc", "red"]) {
      expect(parseHex(invalid), invalid).toBeUndefined();
    }
  });

  it("writes upper-case #RRGGBB, round-tripping", () => {
    expect(toHex(rgb(9, 105, 218))).toBe("#0969DA");
    expect(parseHex(toHex(rgb(1, 2, 3)))).toEqual(rgb(1, 2, 3));
  });
});

describe("WCAG contrast", () => {
  it("gives the reference ratios", () => {
    expect(contrastRatio(hex("#767676"), WHITE)).toBeCloseTo(4.54, 2);
    expect(contrastRatio(hex("#777777"), WHITE)).toBeCloseTo(4.48, 2);
    expect(contrastRatio(BLACK, WHITE)).toBe(21);
    expect(contrastRatio(WHITE, BLACK)).toBe(21);
  });

  it("agrees with the independent oracle on any pair of colours", () => {
    const random = seededRandom(7);
    for (let i = 0; i < 500; i++) {
      const [a, b] = [randomColor(random), randomColor(random)];
      expect(contrastRatio(a, b)).toBeCloseTo(oracleRatio(a, b), 10);
      expect(relativeLuminance(a)).toBeCloseTo(wcag.relativeLuminance(tuple(a)), 10);
    }
  });

  it("mixes channel by channel like the oracle", () => {
    expect(tuple(mix(hex("#000000"), hex("#FFFFFF"), 0.5))).toEqual(
      wcag.mix([0, 0, 0], [255, 255, 255], 0.5),
    );
  });

  it("formats a ratio with a decimal comma, truncated, never rounded up", () => {
    expect(formatRatio(6.14)).toBe("6,1:1");
    expect(formatRatio(4.499)).toBe("4,4:1");
    expect(formatRatio(4.5)).toBe("4,5:1");
    expect(formatRatio(21)).toBe("21,0:1");
  });
});

describe("OKLCH", () => {
  it("round-trips any 8-bit colour within one step per channel", () => {
    const random = seededRandom(11);
    for (let i = 0; i < 500; i++) {
      const color = randomColor(random);
      const back = fromOklch(toOklch(color));
      expect(Math.abs(back.r - color.r), toHex(color)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.g - color.g), toHex(color)).toBeLessThanOrEqual(1);
      expect(Math.abs(back.b - color.b), toHex(color)).toBeLessThanOrEqual(1);
    }
  });

  it("orders lightness like luminance and puts greys at chroma 0", () => {
    expect(toOklch(BLACK).l).toBeCloseTo(0, 5);
    expect(toOklch(WHITE).l).toBeCloseTo(1, 5);
    expect(toOklch(hex("#808080")).c).toBeLessThan(1e-4);
    expect(toOklch(hex("#404040")).l).toBeLessThan(toOklch(hex("#808080")).l);
  });

  it("brings an out-of-gamut colour back into sRGB, keeping its hue", () => {
    const vivid = toOklch(hex("#FF0000"));
    const brighter = fromOklch({ ...vivid, l: 0.9 });
    expect(hueDistance(toOklch(brighter).h, vivid.h)).toBeLessThan(5);
  });
});

describe("correctLightness", () => {
  it("returns the colour itself when it already passes", () => {
    const color = hex("#EDEEF2");
    expect(correctLightness(color, [hex("#0B0D13")], 4.5)).toBe(color);
  });

  it("reaches the target on every ground, as painted", () => {
    const grounds = [hex("#0B0D13"), hex("#222535")];
    const corrected = correctLightness(hex("#B00020"), grounds, 4.5);
    for (const ground of grounds) expect(oracleRatio(corrected, ground)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps the hue of a coloured input", () => {
    const random = seededRandom(3);
    const ground = hex("#FFFFFF");
    for (let i = 0; i < 200; i++) {
      const color = randomColor(random);
      const corrected = correctLightness(color, [ground], 4.5);
      const [before, after] = [toOklch(color), toOklch(corrected)];
      if (before.c > 0.02 && after.c > 0.02) {
        expect(hueDistance(before.h, after.h), toHex(color)).toBeLessThan(5);
      }
      expect(oracleRatio(corrected, ground)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("makes the smallest move: light text on a mid ground stays light", () => {
    const corrected = correctLightness(hex("#FAFAFA"), [hex("#00829B")], 4.5);
    expect(toOklch(corrected).l).toBeGreaterThan(toOklch(hex("#FAFAFA")).l);
  });

  it("falls back to black or white when no lightness reaches the target", () => {
    // Nothing reaches 5:1 on both black and white (the best tie is 4.58:1).
    const fallback = correctLightness(hex("#FF8800"), [BLACK, WHITE], 5);
    expect(["#000000", "#FFFFFF"]).toContain(toHex(fallback));
  });
});

describe("xterm 256 colours", () => {
  it("never picks one of the 16 slots the user's theme defines", () => {
    const random = seededRandom(5);
    for (let i = 0; i < 300; i++) {
      const { slot } = nearestXterm256(randomColor(random));
      expect(slot).toBeGreaterThanOrEqual(16);
      expect(slot).toBeLessThanOrEqual(255);
    }
  });

  it("knows the standardized RGB of the cube and the grey ramp", () => {
    expect(xterm256Color(16).rgb).toEqual(rgb(0, 0, 0));
    expect(xterm256Color(196).rgb).toEqual(rgb(255, 0, 0));
    expect(xterm256Color(231).rgb).toEqual(rgb(255, 255, 255));
    expect(xterm256Color(232).rgb).toEqual(rgb(8, 8, 8));
    expect(xterm256Color(255).rgb).toEqual(rgb(238, 238, 238));
    expect(nearestXterm256(hex("#FF0000")).slot).toBe(196);
  });

  it("finds a slot that still meets a requirement the nearest one misses", () => {
    const ground = xterm256Color(235).rgb;
    const requirement = { grounds: [ground], target: 4.5 };
    const random = seededRandom(9);
    for (let i = 0; i < 200; i++) {
      const color = correctLightness(randomColor(random), [ground], 4.5);
      const { rgb: painted, slot } = quantizeWithin(color, [requirement]);
      expect(slot).toBeGreaterThanOrEqual(16);
      expect(oracleRatio(painted, ground), toHex(color)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
