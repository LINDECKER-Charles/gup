import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALE_NAMES,
  LOCALES,
  parseLocale,
  setActiveLocale,
} from "../../../src/core/i18n/locale.js";
import { localize, localized } from "../../../src/core/i18n/localized.js";
import { SUITE_LOCALE, useLocale } from "../../support/locale.js";

describe("parseLocale", () => {
  it("names English by default, and every language under its own name", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(LOCALES).toEqual(["en", "fr"]);
    expect(LOCALE_NAMES).toEqual({ en: "English", fr: "Français" });
  });

  it("reads a language tag on its primary subtag, case-insensitively", () => {
    for (const tag of ["fr", "FR", " fr ", "fr-CA", "fr_FR.UTF-8", "fr@euro"]) {
      expect(parseLocale(tag), tag).toBe("fr");
    }
    expect(parseLocale("en-GB")).toBe("en");
  });

  it("refuses a language gup does not speak, and anything that is not a tag", () => {
    for (const value of ["de", "", "french", "f", 3, null, undefined, ["fr"]]) {
      expect(parseLocale(value), String(value)).toBeNull();
    }
  });
});

describe("localized catalogs", () => {
  const LABELS = localized({
    en: { quit: "Quit", count: (n: number) => `${n} packages`, keys: ["a"] },
    fr: { quit: "Quitter", count: (n) => `${n} paquets`, keys: ["b"] },
  });

  it("answer in the language active when they are read, not when they were built", () => {
    setActiveLocale("en");
    expect(LABELS.quit).toBe("Quit");
    expect(LABELS.count(2)).toBe("2 packages");
    setActiveLocale("fr");
    expect(LABELS.quit).toBe("Quitter");
    expect(LABELS.count(2)).toBe("2 paquets");
    setActiveLocale(SUITE_LOCALE);
  });

  it("show the current language to spreads and key listings too", () => {
    setActiveLocale("en");
    expect({ ...LABELS }.quit).toBe("Quit");
    expect(Object.entries(LABELS).find(([key]) => key === "keys")?.[1]).toEqual(["a"]);
    setActiveLocale(SUITE_LOCALE);
    expect(Object.keys(LABELS)).toEqual(["quit", "count", "keys"]);
  });

  it("cannot be written to", () => {
    expect(() => {
      (LABELS as { quit: string }).quit = "x";
    }).toThrow(TypeError);
  });
});

describe("localize", () => {
  useLocale("en");

  it("picks the active language's version now", () => {
    expect(localize({ en: "Python not found", fr: "Python introuvable" })).toBe("Python not found");
    setActiveLocale("fr");
    expect(localize({ en: "Python not found", fr: "Python introuvable" })).toBe(
      "Python introuvable",
    );
  });
});
