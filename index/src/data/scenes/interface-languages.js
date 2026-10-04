/**
 * The languages gup's interface speaks — the CLI's `LOCALES`
 * (src/core/i18n/locale.ts) — and which one a page's terminal demo shows.
 * Every TUI mock exists in each of them; tests/rules/scenes-truth.test.mjs
 * holds this list to the languages of the TUI's catalogs.
 *
 * @typedef {"en" | "fr"} InterfaceLanguage
 */

/** @type {readonly InterfaceLanguage[]} */
export const INTERFACE_LANGUAGES = Object.freeze(["en", "fr"]);

/** gup's default: what it speaks until the user picks another language. */
const DEFAULT_LANGUAGE = "en";

/**
 * The interface language a page shows: the page's own when gup speaks it,
 * gup's default otherwise.
 *
 * @param {import("../../i18n/locales.js").LocaleId} localeId
 * @returns {InterfaceLanguage}
 */
export function interfaceLanguageOf(localeId) {
  return INTERFACE_LANGUAGES.includes(localeId) ? localeId : DEFAULT_LANGUAGE;
}

/**
 * `build(language)` for each interface language, keyed by it.
 *
 * @template T
 * @param {(language: InterfaceLanguage) => T} build
 * @returns {Readonly<Record<InterfaceLanguage, T>>}
 */
export function perLanguage(build) {
  return Object.freeze(
    Object.fromEntries(INTERFACE_LANGUAGES.map((language) => [language, build(language)])),
  );
}
