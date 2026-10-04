import { describe, expect, it } from "vitest";
import { LOCALES, setActiveLocale } from "../../../src/core/i18n/locale.js";
import { REPORT_LABELS } from "../../../src/report/report-labels.js";
import { SUITE_LOCALE } from "../../support/locale.js";

/**
 * The client reads the labels by path and lays some of them out by position
 * (a table's columns, the calendar's weekdays): every language must hold
 * the same paths, the same plural pairs and lists of the same length.
 * TypeScript checks the keys of each language; this checks the lengths too.
 */

function shapeOf(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shapeOf);
  if (value === null || typeof value !== "object") return typeof value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, shapeOf(item)]));
}

describe("the report's labels", () => {
  it("have the same shape in every language, lists of the same length included", () => {
    try {
      const shapes = LOCALES.map((locale) => {
        setActiveLocale(locale);
        return shapeOf(REPORT_LABELS);
      });

      for (const shape of shapes) expect(shape).toEqual(shapes[0]);
    } finally {
      setActiveLocale(SUITE_LOCALE);
    }
  });
});
