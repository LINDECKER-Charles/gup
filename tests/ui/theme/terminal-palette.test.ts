import { describe, expect, it } from "vitest";
import { toHex } from "../../../src/ui/theme/color/rgb.js";
import { CONTRAST_RULES, CONTRAST_TARGETS } from "../../../src/ui/theme/contrast-rules.js";
import { CONTRAST_LEVELS, type Palette } from "../../../src/ui/theme/palette.js";
import { resolveTheme, type TerminalFacts } from "../../../src/ui/theme/resolve-theme.js";
import {
  deriveTerminalPalette,
  detectedColorsFrom,
  type DetectedColors,
} from "../../../src/ui/theme/terminal-palette.js";
import * as wcag from "../../support/contrast/wcag.js";
import {
  CAMPBELL,
  REFERENCE_PALETTES,
  SOLARIZED_DARK,
  TERMINAL_APP_BASIC,
  UNSUPPORTED,
} from "../../support/tui/reference-palettes.js";

function detected(reported: typeof CAMPBELL): DetectedColors {
  const colors = detectedColorsFrom(reported);
  if (!colors) throw new Error("fixture not detected");
  return colors;
}

function failingRules(palette: Palette, level: "AA" | "AAA"): string[] {
  return CONTRAST_RULES.flatMap((rule) =>
    rule.grounds.flatMap((ground) => {
      const [fg, bg] = [palette[rule.token], palette[ground]];
      const ratio = wcag.contrastRatio([fg.r, fg.g, fg.b], [bg.r, bg.g, bg.b]);
      return ratio >= CONTRAST_TARGETS[level][rule.kind] ? [] : [`${rule.token}/${ground}`];
    }),
  );
}

const facts = (colors: DetectedColors): TerminalFacts => ({
  colors,
  themeMode: null,
  depth: "truecolor",
  detection: "done",
});

describe("detectedColorsFrom", () => {
  it("reads what a terminal reported over OSC 4 / 10 / 11", () => {
    const colors = detected(CAMPBELL);
    expect(toHex(colors.foreground)).toBe("#CCCCCC");
    expect(toHex(colors.background)).toBe("#0C0C0C");
    expect(colors.ansi.map((slot) => (slot ? toHex(slot) : null))[6]).toBe("#3A96DD");
  });

  it("gives up without the defaults or a slot gup paints with", () => {
    expect(detectedColorsFrom(UNSUPPORTED)).toBeNull();
    expect(detectedColorsFrom({ ...CAMPBELL, defaultForeground: null })).toBeNull();
    expect(detectedColorsFrom({ ...CAMPBELL, defaultBackground: "rgb:0c/0c/0c" })).toBeNull();
    for (const slot of [1, 2, 3, 6]) {
      const palette = CAMPBELL.palette.map((color, index) => (index === slot ? null : color));
      expect(detectedColorsFrom({ ...CAMPBELL, palette }), `slot ${slot}`).toBeNull();
    }
  });

  it("still works without slot 8 (the idle border is then blended)", () => {
    const palette = CAMPBELL.palette.map((color, index) => (index === 8 ? null : color));
    const derived = deriveTerminalPalette(detected({ ...CAMPBELL, palette }));
    expect(derived.sources.borderIdle).toBeUndefined();
  });
});

describe("deriveTerminalPalette", () => {
  it("paints text and semantic colours with the terminal's own defaults and slots", () => {
    const { sources } = deriveTerminalPalette(detected(CAMPBELL));
    expect(sources).toMatchObject({
      background: { kind: "terminal-bg" },
      text: { kind: "terminal-fg" },
      strong: { kind: "terminal-fg" },
      accent: { kind: "slot", slot: 6 },
      success: { kind: "slot", slot: 2 },
      warning: { kind: "slot", slot: 3 },
      danger: { kind: "slot", slot: 1 },
      borderIdle: { kind: "slot", slot: 8 },
    });
  });

  it("never paints the background's colour through a foreground default", () => {
    expect(deriveTerminalPalette(detected(CAMPBELL)).sources.onAccent).toBeUndefined();
  });
});

describe("the terminal theme on real palettes", () => {
  it.each(Object.entries(REFERENCE_PALETTES))(
    "%s meets every rule at AA and AAA once resolved",
    (_name, reported) => {
      for (const contrast of CONTRAST_LEVELS) {
        const resolved = resolveTheme({
          settings: { id: "terminal", contrast, custom: {} },
          terminal: facts(detected(reported)),
          isNoColor: false,
        });
        expect(resolved.mode).toBe("detected");
        expect(failingRules(resolved.palette!, contrast), contrast).toEqual([]);
      }
    },
  );

  it("keeps the terminal's slots and defaults for what needed no fix", () => {
    const resolved = resolveTheme({
      settings: { id: "terminal", contrast: "AA", custom: {} },
      terminal: facts(detected(CAMPBELL)),
      isNoColor: false,
    });
    expect(resolved.sources).toMatchObject({
      text: { kind: "terminal-fg" },
      accent: { kind: "slot", slot: 6 },
      warning: { kind: "slot", slot: 3 },
    });
    // Campbell's red is 2.5:1 on its background: painted in RGB once corrected.
    expect(resolved.sources.danger).toBeUndefined();
    expect(resolved.report.corrections.map((c) => c.token)).toContain("danger");
  });

  it("darkens Terminal.app's light-background colours, and lightens Solarized's text", () => {
    const resolve = (reported: typeof CAMPBELL): string[] =>
      resolveTheme({
        settings: { id: "terminal", contrast: "AA", custom: {} },
        terminal: facts(detected(reported)),
        isNoColor: false,
      }).report.corrections.map((c) => c.token);
    expect(resolve(TERMINAL_APP_BASIC)).toEqual(
      expect.arrayContaining(["accent", "success", "warning"]),
    );
    expect(resolve(SOLARIZED_DARK)).toEqual(expect.arrayContaining(["text"]));
  });
});
