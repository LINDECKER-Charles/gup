/**
 * URL of a locale's home page: root-relative ("/gup/fr/") inside the page so
 * dev and preview servers work, absolute when an origin is given (head,
 * sitemap, JSON-LD, 404). Always built by concatenation — never `path.join`,
 * which emits backslashes on Windows.
 */
import { LINKS } from "../data/links.js";

/**
 * @param {import("./locales.js").Locale} locale
 * @param {string} [origin]
 */
export function localeHref(locale, origin = "") {
  return `${origin}${LINKS.basePath}${locale.path ? `${locale.path}/` : ""}`;
}
