import { html, type SafeHtml } from "./html.js";

export interface Pill {
  readonly label: string;
  readonly href: string;
  readonly isCurrent: boolean;
  readonly count?: { readonly value: number; readonly isWaiting?: boolean };
}

export interface PillGroupInput {
  /** Unique in the page: names the group's label. */
  readonly id: string;
  readonly label: string;
  readonly pills: readonly Pill[];
}

function pill(item: Pill): SafeHtml {
  const current = item.isCurrent ? html` aria-current="page"` : "";
  const waiting = item.count?.isWaiting === true ? " pill__count--waiting" : "";
  const count = item.count === undefined
    ? ""
    : html` <span class="pill__count${waiting}">${item.count.value}</span>`;
  return html`<a class="pill" href="${item.href}"${current}>${item.label}${count}</a>`;
}

/**
 * One filter: a labelled row of links, one value each, the current one
 * marked `aria-current`. Each link keeps the page's other filters.
 */
export function pillGroup(input: PillGroupInput): SafeHtml {
  return html`<nav class="filter" aria-labelledby="${input.id}">
    <span class="field-label" id="${input.id}">${input.label}</span>
    <div class="pills">${input.pills.map(pill)}</div>
  </nav>`;
}
