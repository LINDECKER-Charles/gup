/**
 * Prerender entry, consumed by scripts/prerender.mjs once per locale.
 *
 * The deployed HTML carries the real page — H1, every section, the visible
 * FAQ, the footer link graph — before any JavaScript runs: Google renders JS
 * late and on a budget, and most AI answer engines do not render it at all.
 */
import { renderToString } from "react-dom/server";
import { Page } from "./Page.jsx";

/**
 * @param {{ locale: import("./i18n/locales.js").Locale, messages: object }} page
 *   A PageContext from build/page-context.mjs.
 */
export function render(page) {
  return renderToString(<Page locale={page.locale} messages={page.messages} />);
}
