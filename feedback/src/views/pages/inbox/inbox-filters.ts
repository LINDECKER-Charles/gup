import { FEEDBACK_VOCABULARY, type StatusCounts } from "../../../domain/feedback.js";
import { ADMIN_UI } from "../../admin-ui.js";
import { html, type SafeHtml } from "../../kit/html.js";
import { LABELS } from "../../text/labels.js";
import { inboxHref, type InboxFilters } from "./inbox-href.js";

interface Pill {
  readonly label: string;
  readonly href: string;
  readonly isCurrent: boolean;
  readonly count?: { readonly value: number; readonly isWaiting: boolean };
}

function pill(item: Pill): SafeHtml {
  const current = item.isCurrent ? html` aria-current="page"` : "";
  const waiting = item.count?.isWaiting === true ? " pill__count--waiting" : "";
  const count = item.count === undefined
    ? ""
    : html` <span class="pill__count${waiting}">${item.count.value}</span>`;
  return html`<a class="pill" href="${item.href}"${current}>${item.label}${count}</a>`;
}

function group(id: string, label: string, pills: readonly Pill[]): SafeHtml {
  return html`<nav class="filter" aria-labelledby="${id}">
    <span class="field-label" id="${id}">${label}</span>
    <div class="pills">${pills.map(pill)}</div>
  </nav>`;
}

function statusPills(filters: InboxFilters, counts: StatusCounts): readonly Pill[] {
  const total = FEEDBACK_VOCABULARY.statuses.reduce((sum, status) => sum + counts[status], 0);
  return [...FEEDBACK_VOCABULARY.statuses, null].map((status) => ({
    label: status === null ? "Tous" : LABELS.statusTab[status],
    href: inboxHref({ ...filters, status }),
    isCurrent: status === filters.status,
    count: {
      value: status === null ? total : counts[status],
      isWaiting: status === "new" && counts.new > 0 && filters.status !== "new",
    },
  }));
}

function kindPills(filters: InboxFilters): readonly Pill[] {
  return [null, ...FEEDBACK_VOCABULARY.kinds].map((kind) => ({
    label: kind === null ? "Tous les types" : LABELS.kindFilter[kind],
    href: inboxHref({ ...filters, kind }),
    isCurrent: kind === filters.kind,
  }));
}

/** GET back to the inbox: the search keeps the status and kind chosen. */
function searchForm(filters: InboxFilters): SafeHtml {
  const kind = filters.kind === null
    ? ""
    : html`<input type="hidden" name="kind" value="${filters.kind}">`;
  return html`<form class="search" method="get" action="${ADMIN_UI.home}" role="search">
    <label class="field-label" for="q">Rechercher</label>
    <div class="search__row">
      <input class="field-control" id="q" name="q" type="search" value="${filters.search ?? ""}"
        maxlength="${ADMIN_UI.maxSearchLength}" aria-describedby="q-hint"
        autocomplete="off" spellcheck="false">
      <button class="btn btn--ghost" type="submit">Rechercher</button>
    </div>
    <p class="field-note" id="q-hint">Titre, message, adresse, ID d’installation ou n° (#12).</p>
    <input type="hidden" name="status" value="${filters.status ?? ADMIN_UI.allStatuses}">
    ${kind}
  </form>`;
}

/** Search, then one pill group per filter; each count follows the search. */
export function inboxToolbar(filters: InboxFilters, counts: StatusCounts): SafeHtml {
  return html`<section class="toolbar" aria-label="Recherche et filtres">
    ${searchForm(filters)}
    <div class="toolbar__filters">
      ${group("filter-status", "Statut", statusPills(filters, counts))}
      ${group("filter-kind", "Type", kindPills(filters))}
    </div>
  </section>`;
}
