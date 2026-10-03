import { describe, expect, it } from "vitest";
import { REPORT_CSS } from "../../../src/report/styles/index.js";
import { contrastRatio, parseHexColor, WCAG_MIN_CONTRAST } from "../../support/contrast/wcag.js";

/**
 * WCAG AA for the report, in both themes, checked on the stylesheet the page
 * ships (not on the token table that builds it) with the shared independent
 * oracle: text at least 4.5:1 on every ground it is drawn on, marks that carry
 * meaning (chart fills, heat levels, control borders, the focus ring) at least
 * 3:1 on the surface around them.
 */

type Tokens = Readonly<Record<string, string>>;

function block(selector: string): string {
  const start = REPORT_CSS.indexOf(`${selector}{`);
  if (start < 0) throw new Error(`no ${selector} block`);
  return REPORT_CSS.slice(start + selector.length + 1, REPORT_CSS.indexOf("}", start));
}

function tokens(selector: string): Tokens {
  return Object.fromEntries(
    [...block(selector).matchAll(/--([\w-]+):([^;]+);/g)].map((match) => [match[1], match[2]?.trim()]),
  );
}

const THEMES = {
  light: tokens(":root"),
  dark: tokens(':root[data-theme="dark"]'),
} as const;

/** Text colours and the grounds each is drawn on. */
const TEXT_PAIRS: readonly (readonly [string, readonly string[]])[] = [
  ["text", ["bg", "surface", "surface-2", "surface-hover", "accent-weak"]],
  ["muted", ["bg", "surface", "surface-2"]],
  ["accent", ["bg", "surface", "surface-2", "accent-weak"]],
  ["on-accent", ["accent"]],
  ["ok", ["surface", "ok-weak"]],
  ["fail", ["surface", "fail-weak"]],
  ["skip", ["surface", "skip-weak"]],
  // The tooltip inverts the page: surface-coloured text on a text-coloured ground.
  ["surface", ["text"]],
];

/** Marks that carry meaning, on the surface of the cards they sit in (and the page). */
const MARKS: readonly string[] = [
  "border-strong",
  "accent",
  "ok",
  "fail",
  "skip",
  "heat-0",
  "heat-1",
  "heat-2",
  "heat-3",
  "heat-4",
];

const ratio = (theme: Tokens, foreground: string, background: string) =>
  contrastRatio(parseHexColor(theme[foreground] ?? ""), parseHexColor(theme[background] ?? ""));

describe("report colours", () => {
  it("apply the dark theme by preference unless Clair is chosen, and print in light", () => {
    expect(tokens('@media (prefers-color-scheme: dark){:root:not([data-theme="light"])')).toEqual(THEMES.dark);
    expect(tokens("@media print{:root,:root[data-theme]")).toEqual(THEMES.light);
    expect(Object.keys(THEMES.dark)).toEqual(Object.keys(THEMES.light));
  });

  describe.each(Object.entries(THEMES))("%s theme", (_name, theme) => {
    it.each(TEXT_PAIRS.flatMap(([text, grounds]) => grounds.map((ground) => [text, ground] as const)))(
      "keeps %s text readable on %s (4.5:1)",
      (text, ground) => {
        expect(ratio(theme, text, ground)).toBeGreaterThanOrEqual(WCAG_MIN_CONTRAST.text);
      },
    );

    it.each(MARKS)("keeps the %s mark visible on the surface and the page (3:1)", (mark) => {
      expect(ratio(theme, mark, "surface")).toBeGreaterThanOrEqual(WCAG_MIN_CONTRAST.nonText);
      expect(ratio(theme, mark, "bg")).toBeGreaterThanOrEqual(WCAG_MIN_CONTRAST.nonText);
    });

    it("orders the heat levels from light to dark ink, or dark to light", () => {
      const steps = [1, 2, 3, 4].map((level) => ratio(theme, `heat-${level}`, "surface"));

      expect(steps).toEqual([...steps].sort((a, b) => a - b));
    });
  });
});
