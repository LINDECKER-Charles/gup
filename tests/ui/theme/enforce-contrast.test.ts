import { describe, expect, it } from "vitest";
import { BUILTIN_PALETTES } from "../../../src/ui/theme/builtin-themes.js";
import { parseHex, rgb, toHex, type Rgb } from "../../../src/ui/theme/color/rgb.js";
import { CONTRAST_RULES, CONTRAST_TARGETS } from "../../../src/ui/theme/contrast-rules.js";
import { enforceContrast } from "../../../src/ui/theme/enforce-contrast.js";
import {
  COLOR_TOKENS,
  CONTRAST_LEVELS,
  RGB_THEME_IDS,
  type ContrastLevel,
  type Palette,
} from "../../../src/ui/theme/palette.js";
import * as wcag from "../../support/contrast/wcag.js";
import { seededRandom } from "../../support/random.js";

const tuple = (color: Rgb): wcag.Rgb => [color.r, color.g, color.b];
const hex = (text: string): Rgb => parseHex(text) ?? rgb(0, 0, 0);

/** Every rule of the palette that fails at `level`, measured with the oracle. */
function failingRules(palette: Palette, level: ContrastLevel): string[] {
  return CONTRAST_RULES.flatMap((rule) =>
    rule.grounds.flatMap((ground) => {
      const ratio = wcag.contrastRatio(tuple(palette[rule.token]), tuple(palette[ground]));
      const target = CONTRAST_TARGETS[level][rule.kind];
      return ratio >= target ? [] : [`${rule.token} on ${ground}: ${ratio.toFixed(2)}`];
    }),
  );
}

/** A built-in theme as resolve hands it to the enforcement (the derived token set aside). */
function builtin(id: (typeof RGB_THEME_IDS)[number]): Palette {
  return { ...BUILTIN_PALETTES[id], disabled: BUILTIN_PALETTES[id].text };
}

function randomPalette(random: () => number): Palette {
  const channel = (): number => Math.floor(random() * 256);
  return Object.fromEntries(
    COLOR_TOKENS.map((token) => [token, rgb(channel(), channel(), channel())]),
  ) as unknown as Palette;
}

describe("built-in themes", () => {
  it.each(RGB_THEME_IDS)("%s passes AA as written, with zero corrections", (id) => {
    const palette = builtin(id);
    const enforced = enforceContrast(palette, "AA");
    expect(enforced.corrections).toEqual([]);
    expect(failingRules(palette, "AA")).toEqual([]);
  });

  it("high-contrast passes AAA as written", () => {
    const palette = builtin("high-contrast");
    expect(enforceContrast(palette, "AAA").corrections).toEqual([]);
    expect(failingRules(palette, "AAA")).toEqual([]);
  });
});

describe("enforceContrast", () => {
  it.each(CONTRAST_LEVELS)(
    "makes 1,000 random palettes meet every rule at %s",
    (level) => {
      const random = seededRandom(level === "AA" ? 20261003 : 31001620);
      const failures: string[] = [];
      for (let i = 0; i < 1000; i++) {
        const enforced = enforceContrast(randomPalette(random), level).palette;
        failures.push(...failingRules(enforced, level).map((failure) => `#${i} ${failure}`));
      }
      expect(failures).toEqual([]);
    },
    60_000,
  );

  it("reports a failing custom colour as requested → applied, with both ratios", () => {
    const palette: Palette = { ...builtin("dark"), danger: hex("#B00020") };
    const { corrections } = enforceContrast(palette, "AA");
    expect(corrections).toHaveLength(1);
    const [correction] = corrections;
    expect(correction?.token).toBe("danger");
    expect(toHex(correction!.requested)).toBe("#B00020");
    expect(correction!.before).toBeLessThan(4.5);
    expect(correction!.after).toBeGreaterThanOrEqual(4.5);
  });

  it("never reports a target-seeking token as a correction", () => {
    const palette: Palette = { ...builtin("dark"), disabled: hex("#1A1C22") };
    const enforced = enforceContrast(palette, "AA", new Set(["disabled"]));
    expect(enforced.corrections).toEqual([]);
    expect(failingRules(enforced.palette, "AA")).toEqual([]);
  });

  it("moves a mid-grey background off the middle, and says so", () => {
    const palette: Palette = { ...builtin("dark"), background: hex("#808080") };
    const enforced = enforceContrast(palette, "AA");
    expect(enforced.corrections.map((c) => c.token)).toContain("background");
    expect(failingRules(enforced.palette, "AA")).toEqual([]);
  });

  it("measures the lowest text ratio, target-seeking tokens excluded", () => {
    const enforced = enforceContrast(builtin("dark"), "AA", new Set(["disabled"]));
    expect(enforced.minTextRatio).toBeCloseTo(6.14, 2);
  });
});
