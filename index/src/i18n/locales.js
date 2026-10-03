/**
 * The site's locales, in speaker-ranking order (Ethnologue, total speakers):
 * the language menu, the footer list, the hreflang alternates and the sitemap
 * all follow this order.
 *
 * Imported by the client bundle (language menu, `<html lang dir>`) and by the
 * build (head, sitemap, prerender). It holds metadata only — never copy: the
 * catalogs under ./catalogs/ are build-time inputs and must not reach the
 * client bundle (tests/design/boundaries.test.mjs).
 *
 * @typedef {"en" | "zh" | "hi" | "es" | "ar" | "fr" | "bn" | "pt"} LocaleId
 * @typedef {"latin" | "han" | "devanagari" | "arabic" | "bengali"} Script
 *
 * @typedef {object} Locale
 * @property {LocaleId} id
 * @property {string} path        URL segment under the base path; "" for the default locale.
 * @property {boolean} isDefault  Exactly one: served at the base path and used as x-default.
 * @property {string} htmlLang    `<html lang>` value, also the Intl.PluralRules tag.
 * @property {string} hreflang    Value of the hreflang alternates.
 * @property {"ltr" | "rtl"} dir
 * @property {string} ogLocale    Open Graph locale (language_TERRITORY).
 * @property {string} endonym     The language's own name, shown in the language lists.
 * @property {Script} script      Drives the font preloads and the typography overrides.
 * @property {string} [ogImage]   Social card path relative to the site root; absent → default card.
 */

/** @type {readonly Locale[]} */
export const LOCALES = Object.freeze([
  Object.freeze({
    id: "en",
    path: "",
    isDefault: true,
    htmlLang: "en",
    hreflang: "en",
    dir: "ltr",
    ogLocale: "en_US",
    endonym: "English",
    script: "latin",
    ogImage: "public/og-image.png",
  }),
  Object.freeze({
    id: "fr",
    path: "fr",
    isDefault: false,
    htmlLang: "fr",
    hreflang: "fr",
    dir: "ltr",
    ogLocale: "fr_FR",
    endonym: "Français",
    script: "latin",
    ogImage: "public/og/fr.png",
  }),
]);
