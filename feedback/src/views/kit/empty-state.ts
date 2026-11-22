import { html, type SafeHtml } from "./html.js";

export function emptyState(title: string, hint?: string): SafeHtml {
  return html`<div class="empty">
    <p class="empty__title">${title}</p>
    ${hint === undefined ? "" : html`<p class="empty__hint">${hint}</p>`}
  </div>`;
}
