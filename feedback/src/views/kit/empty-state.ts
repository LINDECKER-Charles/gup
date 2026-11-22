import { html, type SafeHtml } from "./html.js";

export interface EmptyStateInput {
  /** What is missing. */
  readonly title: string;
  /** Why, or what fills it. */
  readonly hint?: string;
  /** The gesture that gets out of it, when there is one. */
  readonly action?: { readonly href: string; readonly label: string };
}

export function emptyState(input: EmptyStateInput): SafeHtml {
  const hint = input.hint === undefined ? "" : html`<p class="empty__hint">${input.hint}</p>`;
  const action = input.action === undefined
    ? ""
    : html`<a class="btn btn--ghost btn--small" href="${input.action.href}">
      ${input.action.label}</a>`;
  return html`<div class="empty">
    <p class="empty__title">${input.title}</p>
    ${hint}
    ${action}
  </div>`;
}
