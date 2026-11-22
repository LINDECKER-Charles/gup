import { html, type SafeHtml } from "../../kit/html.js";

const JSON_INDENT = 2;

/**
 * The record as the CLI sent it, pretty-printed and folded: everything,
 * not a summary. The `html` tag escapes it like any other text.
 */
export function recordData(data: Readonly<Record<string, unknown>>): SafeHtml {
  const json = JSON.stringify(data, null, JSON_INDENT);
  return html`<details class="details"><summary>Données complètes</summary>
    <pre>${json}</pre></details>`;
}
