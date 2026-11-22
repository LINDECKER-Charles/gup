import { ADMIN_UI } from "./admin-ui.js";
import { html, type SafeHtml } from "./kit/html.js";

/** The hidden input every back-office form carries. */
export function csrfField(token: string): SafeHtml {
  return html`<input type="hidden" name="${ADMIN_UI.csrfField}" value="${token}">`;
}
