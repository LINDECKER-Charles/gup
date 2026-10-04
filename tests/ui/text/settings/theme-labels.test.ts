import { describe, expect, it } from "vitest";
import type { ThemeSettings } from "../../../../src/ui/settings/theme-section.js";
import { resolveTheme, type TerminalFacts } from "../../../../src/ui/theme/resolve-theme.js";
import {
  COLOR_EDITOR,
  CONTRAST_STATUS,
  contrastStatus,
  formatRatio,
  THEME_PICKER,
} from "../../../../src/ui/text/settings/theme-labels.js";

const UNKNOWN: TerminalFacts = { colors: null, themeMode: null, depth: "truecolor", detection: "done" };

function statusOf(
  theme: Partial<ThemeSettings>,
  context: { readonly terminal?: Partial<TerminalFacts>; readonly isNoColor?: boolean } = {},
) {
  const settings: ThemeSettings = { id: "dark", contrast: "AA", custom: {}, ...theme };
  return contrastStatus(
    resolveTheme({
      settings,
      terminal: { ...UNKNOWN, ...context.terminal },
      isNoColor: context.isNoColor ?? false,
    }),
  );
}

describe("formatRatio", () => {
  it("writes one decimal with a comma, truncated so a ratio never reads higher than it is", () => {
    expect(formatRatio(6.14)).toBe("6,1:1");
    expect(formatRatio(4.499)).toBe("4,4:1");
    expect(formatRatio(4.5)).toBe("4,5:1");
    expect(formatRatio(21)).toBe("21,0:1");
  });
});

describe("contrastStatus", () => {
  it("gives a theme's level and lowest ratio when it passes as is", () => {
    expect(statusOf({})).toEqual({ text: CONTRAST_STATUS.pass("AA", 6.14), tone: "success" });
  });

  it("counts the colours it had to adjust, the ones a user tunes", () => {
    const status = statusOf({ custom: { dark: { accent: "#0B0D13" } } });
    expect(status.tone).toBe("warning");
    expect(status.text).toMatch(/^⚠ 1 couleur ajustée · min\. \d+,\d:1$/);
    const two = statusOf({ custom: { dark: { accent: "#0B0D13", success: "#0B0D13" } } });
    expect(two.text).toMatch(/^⚠ 2 couleurs ajustées · /);
  });

  it("says when the contrast cannot be checked, or is still being detected", () => {
    expect(statusOf({ id: "terminal" }).text).toBe(CONTRAST_STATUS.unverified);
    expect(statusOf({ id: "terminal" }, { terminal: { detection: "pending" } }).text).toBe(
      CONTRAST_STATUS.pending,
    );
  });

  it("says what NO_COLOR, monochrome and small palettes impose", () => {
    expect(statusOf({}, { isNoColor: true }).text).toBe(CONTRAST_STATUS.noColor);
    expect(statusOf({ id: "monochrome" }).text).toBe(CONTRAST_STATUS.monochrome);
    expect(statusOf({}, { terminal: { depth: "16" } }).text).toBe(CONTRAST_STATUS.depth16);
    expect(statusOf({}, { terminal: { depth: "256" } }).text).toMatch(/^couleurs approchées/);
  });
});

describe("adjusted colours, staying readable", () => {
  it("agrees « lisible » with the colours it counts", () => {
    expect(THEME_PICKER.corrections(1)).toBe("1 couleur ajustée pour rester lisible");
    expect(THEME_PICKER.corrections(2)).toBe("2 couleurs ajustées pour rester lisibles");
    expect(COLOR_EDITOR.corrected(1, "AA")).toMatch(
      /^⚠ 1 couleur ajustée automatiquement pour rester lisible \(AA\)\. /,
    );
    expect(COLOR_EDITOR.corrected(3, "AAA")).toMatch(
      /^⚠ 3 couleurs ajustées automatiquement pour rester lisibles \(AAA\)\. /,
    );
  });
});
