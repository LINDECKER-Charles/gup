/**
 * Page contexts for the SEO and template suites: the real registry, plus a
 * synthetic right-to-left, non-Latin locale (English copy under Arabic
 * metadata) so direction and font-preload logic are covered whatever locales
 * are registered.
 */
import { pageContexts } from "../../build/page-context.mjs";
import { CATALOGS } from "../../build/i18n/load-catalogs.mjs";
import { LOCALES } from "../../src/i18n/locales.js";

export const BUILD = Object.freeze({ modified: "2026-10-03T12:00:00+02:00" });

const SYNTHETIC_RTL = Object.freeze({
  id: "ar",
  path: "ar",
  isDefault: false,
  htmlLang: "ar",
  hreflang: "ar",
  dir: "rtl",
  ogLocale: "ar_AR",
  endonym: "العربية",
  script: "arabic",
});

export const realPages = () => pageContexts(BUILD);

export function syntheticPages() {
  const locales = [...LOCALES.filter((locale) => locale.id !== "ar"), SYNTHETIC_RTL];
  return pageContexts(BUILD, { locales, catalogs: { ...CATALOGS, ar: CATALOGS.en } });
}

/** A copy of `page` whose messages carry the given overrides, namespace by namespace. */
export function withMessages(page, overrides) {
  const messages = { ...page.messages };
  for (const [namespace, values] of Object.entries(overrides)) {
    messages[namespace] = { ...messages[namespace], ...values };
  }
  return { ...page, messages };
}
