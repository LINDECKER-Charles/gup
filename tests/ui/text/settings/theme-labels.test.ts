import { describe, expect, it } from "vitest";
import type { ThemeSettings } from "../../../../src/ui/settings/theme-section.js";
import { resolveTheme, type TerminalFacts } from "../../../../src/ui/theme/resolve-theme.js";
import {
  CONTRAST_STATUS,
  contrastStatus,
  formatRatio,
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

  it("counts the colours it had to adjust", () => {
    const status = statusOf({ custom: { dark: { accent: "#0B0D13" } } });
    expect(status.tone).toBe("warning");
    expect(status.text).toMatch(/^⚠ \d+ couleur\(s\) ajustée\(s\) · min\. \d+,\d:1$/);
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
