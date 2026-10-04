import { describe, expect, it } from "vitest";
import type { ThemeSettings } from "../../../src/ui/settings/theme-section.js";
import { resolveTheme, type TerminalFacts } from "../../../src/ui/theme/resolve-theme.js";
import {
  buildThemePaint,
  type ColorRef,
  type FillKey,
  type TextStyle,
  type ThemePaint,
} from "../../../src/ui/theme/style-table.js";
import { detectedColorsFrom } from "../../../src/ui/theme/terminal-palette.js";
import type { Tone } from "../../../src/ui/tui/styled-lines.js";
import * as wcag from "../../support/contrast/wcag.js";
import { CAMPBELL } from "../../support/tui/reference-palettes.js";

const TRUECOLOR: TerminalFacts = {
  colors: null,
  themeMode: null,
  depth: "truecolor",
  detection: "done",
};

function paintOf(
  settings: Partial<ThemeSettings>,
  terminal: Partial<TerminalFacts> = {},
  platform: NodeJS.Platform = "linux",
): ThemePaint {
  return buildThemePaint(
    resolveTheme({
      settings: { id: "terminal", contrast: "AA", custom: {}, ...settings },
      terminal: { ...TRUECOLOR, ...terminal },
      isNoColor: false,
      platform,
    }),
  );
}

function styles(paint: ThemePaint, fill?: FillKey): Array<[Tone, TextStyle]> {
  return Object.entries(paint.text).flatMap(([tone, row]) =>
    Object.entries(row)
      .filter(([key]) => fill === undefined || key === fill)
      .map(([, style]): [Tone, TextStyle] => [tone as Tone, style]),
  );
}

const rgbOf = (ref: ColorRef | undefined): string | undefined =>
  ref?.rgb ? `${ref.rgb.r},${ref.rgb.g},${ref.rgb.b}` : undefined;

describe("buildThemePaint: palette modes", () => {
  it("paints every tone on the accent fill with the fill's own text colour", () => {
    const paint = paintOf({ id: "dark" });
    const onAccent = paint.text.onAccent.accent;
    for (const [tone, style] of styles(paint, "accent")) {
      expect(rgbOf(style.fg), tone).toBe(rgbOf(onAccent.fg));
      expect(rgbOf(style.bg), tone).toBe(rgbOf(onAccent.bg));
    }
  });

  it("never dims: the palette carries the hierarchy", () => {
    for (const settings of [{ id: "dark" as const }, {}]) {
      const paint = paintOf(settings, { colors: detectedColorsFrom(CAMPBELL) });
      expect(styles(paint).filter(([, style]) => style.isDim)).toEqual([]);
    }
  });

  it("paints the cursor row on the highlight and plain text in an explicit colour", () => {
    const paint = paintOf({ id: "light" });
    expect(paint.text.plain.highlight.bg).toMatchObject({ kind: "rgb" });
    expect(paint.text.plain.none.fg).toMatchObject({ kind: "rgb" });
    expect(paint.background).toMatchObject({ kind: "rgb" });
  });

  it("keeps the terminal's own background and text in detected mode", () => {
    const paint = paintOf({}, { colors: detectedColorsFrom(CAMPBELL) });
    expect(paint.background).toBeNull();
    expect(paint.text.plain.none.fg).toMatchObject({ kind: "terminal-fg" });
    expect(rgbOf(paint.text.plain.none.fg)).toBe("204,204,204");
    expect(paint.text.accent.none.fg).toMatchObject({ kind: "slot", slot: 6 });
    // The background's colour as text can only travel as RGB.
    expect(paint.text.onAccent.accent.fg).toMatchObject({ kind: "rgb" });
  });

  it("reads the onAccent tone as strong text off the accent fill", () => {
    const paint = paintOf({ id: "dark" });
    expect(paint.text.onAccent.none).toEqual(paint.text.strong.none);
  });
});

describe("buildThemePaint: trusted mode (palette unknown)", () => {
  const paint = paintOf({});

  it("paints neutral text in the terminal's foreground, colours in its ANSI slots", () => {
    expect(paint.text.plain.none).toMatchObject({ fg: { kind: "terminal-fg" }, isDim: false });
    expect(paint.text.muted.none).toMatchObject({ fg: { kind: "terminal-fg" }, isDim: true });
    expect(paint.text.accent.none.fg).toEqual({ kind: "slot", slot: 6 });
    expect(paint.text.danger.none.fg).toEqual({ kind: "slot", slot: 1 });
  });

  it("draws fills in inverse video, never on a background colour", () => {
    for (const fill of ["highlight", "accent"] as const) {
      for (const [tone, style] of styles(paint, fill)) {
        expect(style, `${tone}/${fill}`).toMatchObject({ isInverse: true, isDim: false });
        expect(style.bg, `${tone}/${fill}`).toBeUndefined();
      }
    }
    expect(paint.background).toBeNull();
    expect(paint.input.isInverse).toBe(true);
  });

  // The Windows console never reports its palette: what gup paints there is
  // what its default Campbell shows. Its red (slot 1) was 3.2:1.
  it.each(["AA", "AAA"] as const)(
    "reaches %s on the Windows console's default palette with every coloured text",
    (contrast) => {
      const onConsole = paintOf({ contrast }, {}, "win32");
      const background = wcag.parseHexColor(CAMPBELL.defaultBackground!);
      const shown = (ref: ColorRef): wcag.Rgb =>
        wcag.parseHexColor(
          (ref.kind === "slot" ? CAMPBELL.palette[ref.slot] : CAMPBELL.defaultForeground) ?? "",
        );
      const minimum = contrast === "AA" ? 4.5 : 7;
      for (const tone of ["accent", "success", "warning", "danger"] as const) {
        const ratio = wcag.contrastRatio(shown(onConsole.text[tone].none.fg), background);
        expect(ratio, tone).toBeGreaterThanOrEqual(minimum);
      }
      for (const border of [onConsole.border.idle, onConsole.border.focus]) {
        expect(wcag.contrastRatio(shown(border), background)).toBeGreaterThanOrEqual(3);
      }
    },
  );
});

describe("buildThemePaint: monochrome", () => {
  it("uses no colour but the terminal's foreground, fills in inverse video", () => {
    const paint = paintOf({ id: "monochrome" });
    for (const [tone, style] of styles(paint)) {
      expect(style.fg, tone).toEqual({ kind: "terminal-fg" });
      expect(style.bg, tone).toBeUndefined();
      expect(style.isDim, tone).toBe(false);
    }
    expect(paint.text.plain.highlight.isInverse).toBe(true);
    expect(paint.text.plain.accent).toMatchObject({ isInverse: true, isBold: true });
    expect(paint.border).toEqual({ idle: { kind: "terminal-fg" }, focus: { kind: "terminal-fg" } });
  });
});
