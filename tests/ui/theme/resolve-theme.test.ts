import { describe, expect, it } from "vitest";
import type { CustomColors, ThemeSettings } from "../../../src/ui/settings/theme-section.js";
import { BUILTIN_PALETTES } from "../../../src/ui/theme/builtin-themes.js";
import { xterm256Color } from "../../../src/ui/theme/color/quantize-256.js";
import { rgb, toHex, type Rgb } from "../../../src/ui/theme/color/rgb.js";
import { CONTRAST_RULES, CONTRAST_TARGETS } from "../../../src/ui/theme/contrast-rules.js";
import {
  COLOR_TOKENS,
  CONTRAST_LEVELS,
  CUSTOMIZABLE_TOKENS,
  RGB_THEME_IDS,
  type ContrastLevel,
  type Palette,
} from "../../../src/ui/theme/palette.js";
import {
  isNoColor,
  resolveTheme,
  themeAvailability,
  type ResolvedTheme,
  type ResolveInput,
  type TerminalFacts,
} from "../../../src/ui/theme/resolve-theme.js";
import { buildThemePaint, type ColorRef } from "../../../src/ui/theme/style-table.js";
import {
  detectedColorsFrom,
  type DetectedColors,
} from "../../../src/ui/theme/terminal-palette.js";
import * as wcag from "../../support/contrast/wcag.js";
import { pick, seededRandom } from "../../support/random.js";
import { CAMPBELL, TERMINAL_APP_BASIC } from "../../support/tui/reference-palettes.js";

const TRUECOLOR: TerminalFacts = {
  colors: null,
  themeMode: null,
  depth: "truecolor",
  detection: "idle",
};

function input(
  settings: Partial<ThemeSettings>,
  terminal: Partial<TerminalFacts> = {},
): ResolveInput {
  return {
    settings: { id: "terminal", contrast: "AA", custom: {}, ...settings },
    terminal: { ...TRUECOLOR, ...terminal },
    isNoColor: false,
  };
}

function failingRules(palette: Palette): string[] {
  return CONTRAST_RULES.flatMap((rule) =>
    rule.grounds.flatMap((ground) => {
      const [fg, bg] = [palette[rule.token], palette[ground]];
      const ratio = wcag.contrastRatio([fg.r, fg.g, fg.b], [bg.r, bg.g, bg.b]);
      return ratio >= CONTRAST_TARGETS.AA[rule.kind] ? [] : [`${rule.token}/${ground}`];
    }),
  );
}

describe("resolveTheme: which paint mode wins", () => {
  it("NO_COLOR forces monochrome over any theme", () => {
    const resolved = resolveTheme({ ...input({ id: "dark" }), isNoColor: true });
    expect(resolved).toMatchObject({ mode: "monochrome", effective: "monochrome", palette: null });
    expect(resolved.report.notices).toEqual(["no-color"]);
  });

  it("the monochrome theme paints no colour", () => {
    expect(resolveTheme(input({ id: "monochrome" }))).toMatchObject({
      mode: "monochrome",
      report: { minTextRatio: null, notices: [] },
    });
  });

  it("a 16-colour terminal falls back to its own slots for RGB themes and auto", () => {
    for (const id of ["dark", "auto"] as const) {
      const resolved = resolveTheme(input({ id, custom: { dark: { accent: "#FF8800" } } }, {
        depth: "16",
      }));
      expect(resolved).toMatchObject({ mode: "trusted", effective: "terminal", palette: null });
      expect(resolved.report.notices).toEqual(["depth-16"]);
    }
    expect(resolveTheme(input({ id: "terminal" }, { depth: "16" })).report.notices).toEqual([]);
  });

  it("the terminal theme uses the detected palette, and trusts the slots until then", () => {
    const colors = detectedColorsFrom(CAMPBELL);
    expect(resolveTheme(input({}, { colors, detection: "done" })).mode).toBe("detected");
    const pending = resolveTheme(input({}, { detection: "pending" }));
    expect(pending).toMatchObject({ mode: "trusted", report: { notices: ["palette-pending"] } });
    expect(resolveTheme(input({}, { detection: "idle" })).report.notices).toEqual([
      "palette-pending",
    ]);
    expect(resolveTheme(input({}, { detection: "done" })).report.notices).toEqual([
      "palette-unknown",
    ]);
  });

  it("auto follows the terminal's background, dark when unknown", () => {
    expect(resolveTheme(input({ id: "auto" }, { themeMode: "light" })).effective).toBe("light");
    expect(resolveTheme(input({ id: "auto" }, { themeMode: "dark" })).effective).toBe("dark");
    expect(resolveTheme(input({ id: "auto" })).effective).toBe("dark");
  });

  it("an RGB theme paints its own palette, plus a derived disabled grey at the AA floor", () => {
    const resolved = resolveTheme(input({ id: "github-light" }));
    expect(resolved.mode).toBe("rgb");
    expect(toHex(resolved.palette!.accent)).toBe(toHex(BUILTIN_PALETTES["github-light"].accent));
    const { disabled, background, highlight } = resolved.palette!;
    const ratio = Math.min(
      ...[background, highlight].map((ground) =>
        wcag.contrastRatio([disabled.r, disabled.g, disabled.b], [ground.r, ground.g, ground.b]),
      ),
    );
    expect(ratio).toBeGreaterThanOrEqual(4.5);
    expect(ratio).toBeLessThan(4.6);
  });
});

describe("resolveTheme: custom colours", () => {
  it("apply to their own theme only; the accent also colours the bar and the focus", () => {
    const custom = { dark: { accent: "#FFB86C" } } as const;
    const dark = resolveTheme(input({ id: "dark", custom }));
    expect(toHex(dark.palette!.accent)).toBe("#FFB86C");
    expect(toHex(dark.palette!.accentFill)).toBe("#FFB86C");
    expect(toHex(dark.palette!.borderFocus)).toBe("#FFB86C");
    const light = resolveTheme(input({ id: "light", custom }));
    expect(toHex(light.palette!.accent)).toBe(toHex(BUILTIN_PALETTES.light.accent));
  });

  it("are corrected when unreadable, and the report says so", () => {
    const resolved = resolveTheme(input({ id: "dark", custom: { dark: { danger: "#B00020" } } }));
    expect(resolved.report.notices).toEqual(["corrected"]);
    expect(resolved.report.corrections).toMatchObject([{ token: "danger" }]);
    expect(failingRules(resolved.palette!)).toEqual([]);
  });

  it("never touch the terminal's slots they do not replace", () => {
    const resolved = resolveTheme(
      input(
        { custom: { terminal: { accent: "#3A96DD" } } },
        { colors: detectedColorsFrom(CAMPBELL), detection: "done" },
      ),
    );
    expect(resolved.sources.warning).toEqual({ kind: "slot", slot: 3 });
  });
});

describe("resolveTheme: 256-colour terminals", () => {
  it.each(RGB_THEME_IDS)("%s paints only standardized slots, still AA", (id) => {
    const resolved = resolveTheme(input({ id }, { depth: "256" }));
    expect(resolved.report.notices).toContain("depth-256");
    for (const token of COLOR_TOKENS) {
      const source = resolved.sources[token];
      expect(source?.kind, token).toBe("slot");
      if (source?.kind !== "slot") continue;
      expect(source.slot).toBeGreaterThanOrEqual(16);
      expect(toHex(resolved.palette![token])).toBe(toHex(xterm256Color(source.slot).rgb));
    }
    expect(failingRules(resolved.palette!)).toEqual([]);
  });

  it("moves only the corrected colours of a detected palette", () => {
    const resolved = resolveTheme(
      input(
        {},
        { colors: detectedColorsFrom(TERMINAL_APP_BASIC), depth: "256", detection: "done" },
      ),
    );
    expect(resolved.sources.text).toEqual({ kind: "terminal-fg" });
    expect(resolved.sources.danger).toEqual({ kind: "slot", slot: 1 });
    const accent = resolved.sources.accent;
    expect(accent?.kind === "slot" && accent.slot >= 16).toBe(true);
    expect(failingRules(resolved.palette!)).toEqual([]);
  });
});

describe("themeAvailability", () => {
  it("lists every theme with its lowest text ratio", () => {
    const themes = themeAvailability(input({}));
    expect(themes.map((theme) => theme.id)).toEqual([
      "terminal",
      "auto",
      ...RGB_THEME_IDS,
      "monochrome",
    ]);
    expect(themes.every((theme) => theme.isAvailable)).toBe(true);
    expect(themes.find((theme) => theme.id === "dark")?.minTextRatio).toBeCloseTo(6.14, 2);
    expect(themes.find((theme) => theme.id === "terminal")?.minTextRatio).toBeNull();
  });

  it("marks the RGB themes unavailable on a 16-colour terminal", () => {
    const themes = themeAvailability(input({}, { depth: "16" }));
    const unavailable = themes.filter((theme) => !theme.isAvailable).map((theme) => theme.id);
    expect(unavailable).toEqual(["auto", ...RGB_THEME_IDS]);
    expect(themes.find((theme) => theme.id === "dark")?.reason).toBe("depth-16");
  });
});

describe("isNoColor", () => {
  it("is on when NO_COLOR is present and not empty (no-color.org)", () => {
    expect(isNoColor({ NO_COLOR: "1" })).toBe(true);
    expect(isNoColor({ NO_COLOR: "false" })).toBe(true);
    expect(isNoColor({ NO_COLOR: "" })).toBe(false);
    expect(isNoColor({})).toBe(false);
  });
});


/**
 * The guarantee end to end, for colours nobody chose with care: random
 * custom colours on every theme gup paints, random terminal palettes under
 * the terminal theme, on truecolor and 256-colour terminals, at both levels.
 * Measured on the paint itself — what each cell shows: its own RGB, or the
 * terminal's default it stands for — with the independent oracle.
 */
describe("resolveTheme + paint: every painted pair holds, whatever the colours", () => {
  const CASES = 300;
  const SCENARIOS = (["truecolor", "256"] as const).flatMap((depth) =>
    CONTRAST_LEVELS.map((level) => [depth, level] as const),
  );
  const TUNABLE = ["auto", ...RGB_THEME_IDS] as const;
  type Pair = [label: string, ink: Rgb, ground: Rgb, target: number];

  const seedOf = (depth: TerminalFacts["depth"], level: ContrastLevel, salt: number): number =>
    (depth === "256" ? 256_000 : 24_000) + (level === "AAA" ? 100 : 0) + salt;

  const randomRgb = (random: () => number): Rgb =>
    rgb(random() * 256, random() * 256, random() * 256);

  function randomCustoms(random: () => number): CustomColors {
    const tuned = CUSTOMIZABLE_TOKENS.filter(() => random() < 0.5);
    return Object.fromEntries(tuned.map((token) => [token, toHex(randomRgb(random))]));
  }

  function randomTerminal(random: () => number): DetectedColors {
    const ansi = Array.from({ length: 16 }, () => randomRgb(random));
    return { foreground: randomRgb(random), background: randomRgb(random), ansi };
  }

  function shown(ref: ColorRef): Rgb {
    if (!ref.rgb) throw new Error(`a palette mode painted an unknown colour: ${ref.kind}`);
    return ref.rgb;
  }

  /** Every pair the paint puts on screen. `screen`: what a cell left unpainted shows. */
  function pairsOf(resolved: ResolvedTheme, screen: Rgb): Pair[] {
    const paint = buildThemePaint(resolved);
    const { text, ui } = CONTRAST_TARGETS[resolved.report.level];
    const ground = paint.background ? shown(paint.background) : screen;
    const field = paint.input.background ? shown(paint.input.background) : ground;
    const chunks = Object.entries(paint.text).flatMap(([tone, fills]) =>
      Object.entries(fills).map(
        ([fill, style]): Pair => [
          `${tone} on ${fill}`,
          shown(style.fg),
          style.bg ? shown(style.bg) : ground,
          text,
        ],
      ),
    );
    return [
      ...chunks,
      ["idle border", shown(paint.border.idle), ground, ui],
      ["focus border", shown(paint.border.focus), ground, ui],
      ["panel title", shown(paint.title), ground, text],
      ["typed text", shown(paint.input.text), field, text],
      ["placeholder", shown(paint.input.placeholder), field, text],
    ];
  }

  function failuresOf(resolved: ResolvedTheme, screen: Rgb): string[] {
    return pairsOf(resolved, screen).flatMap(([label, ink, ground, target]) => {
      const ratio = wcag.contrastRatio([ink.r, ink.g, ink.b], [ground.r, ground.g, ground.b]);
      return ratio >= target ? [] : [`${label} ${ratio.toFixed(2)} < ${target}`];
    });
  }

  it.each(SCENARIOS)("gup's themes with random custom colours, %s, %s", (depth, level) => {
    const random = seededRandom(seedOf(depth, level, 1));
    const failures = Array.from({ length: CASES }, (_, index) => {
      const id = pick(random, TUNABLE);
      const resolved = resolveTheme({
        settings: { id, contrast: level, custom: { [id]: randomCustoms(random) } },
        terminal: { ...TRUECOLOR, depth, themeMode: pick(random, ["dark", "light"] as const) },
        isNoColor: false,
      });
      const painted = resolved.palette?.background ?? rgb(0, 0, 0);
      return failuresOf(resolved, painted).map((failure) => `#${index} ${id}: ${failure}`);
    });
    expect(failures.flat()).toEqual([]);
  });

  it.each(SCENARIOS)("the terminal theme on random palettes and colours, %s, %s", (depth, level) => {
    const random = seededRandom(seedOf(depth, level, 2));
    const failures = Array.from({ length: CASES }, (_, index) => {
      const colors = randomTerminal(random);
      const custom = random() < 0.5 ? { terminal: randomCustoms(random) } : {};
      const resolved = resolveTheme({
        settings: { id: "terminal", contrast: level, custom },
        terminal: { ...TRUECOLOR, colors, depth, detection: "done" },
        isNoColor: false,
      });
      return failuresOf(resolved, colors.background).map((failure) => `#${index}: ${failure}`);
    });
    expect(failures.flat()).toEqual([]);
  });
});
