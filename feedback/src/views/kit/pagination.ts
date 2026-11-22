import type { Page } from "../../ports/page.js";
import { html, type SafeHtml } from "./html.js";

export interface PaginationInput {
  readonly page: Page<unknown>;
  /** Builds the URL of another page, keeping the current filters. */
  readonly hrefFor: (page: number) => string;
  readonly label: string;
}

/** Previous / next links with the position; nothing when everything fits on one page. */
export function pagination(input: PaginationInput): SafeHtml {
  const { page, hrefFor } = input;
  const last = Math.max(1, Math.ceil(page.total / page.pageSize));
  if (last <= 1) return html``;
  const previous = page.page > 1 ? hrefFor(page.page - 1) : null;
  const next = page.page < last ? hrefFor(page.page + 1) : null;
  return html`<nav class="pagination" aria-label="${input.label}">
    ${stepLink(previous, "← Précédente", "prev")}
    <span class="pagination__position">Page ${page.page} sur ${last}</span>
    ${stepLink(next, "Suivante →", "next")}
  </nav>`;
}

function stepLink(href: string | null, text: string, rel: "prev" | "next"): SafeHtml {
  return href === null
    ? html`<span class="button button--quiet" aria-disabled="true">${text}</span>`
    : html`<a class="button button--quiet" rel="${rel}" href="${href}">${text}</a>`;
}
