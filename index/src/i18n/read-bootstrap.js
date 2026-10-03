/**
 * Reads the inline JSON block the prerender wrote (see ./bootstrap.js): the
 * locale id and the resolved messages the server rendered with. The client
 * hydrates from exactly these strings, so the bundle never imports a catalog.
 *
 * Throws on a missing, malformed or foreign payload. The prerendered page
 * stays fully readable in that case; the console error is what the verify
 * suite catches.
 *
 * @typedef {import("./locales.js").Locale} Locale
 * @typedef {{ locale: Locale, messages: object }} Bootstrap
 */
import { BOOTSTRAP } from "./bootstrap.js";
import { LOCALES } from "./locales.js";

/**
 * @param {Document} doc
 * @returns {Bootstrap}
 */
export function readBootstrap(doc) {
  const element = doc.getElementById(BOOTSTRAP.elementId);
  if (!element) throw new Error(`bootstrap: #${BOOTSTRAP.elementId} is missing`);
  const payload = JSON.parse(element.textContent ?? "");
  if (payload?.v !== BOOTSTRAP.version) {
    throw new Error(`bootstrap: unsupported payload version ${payload?.v}`);
  }
  const locale = LOCALES.find((candidate) => candidate.id === payload.locale);
  if (!locale) throw new Error(`bootstrap: unknown locale "${payload.locale}"`);
  return { locale, messages: payload.messages };
}
