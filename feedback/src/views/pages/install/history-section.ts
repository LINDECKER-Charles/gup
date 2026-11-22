import { JOURNAL_VOCABULARY } from "../../../domain/journal.js";
import type {
  HistoryBreakdownCell, StoredHistoryRecord,
} from "../../../ports/install-reader.js";
import type { Page } from "../../../ports/page.js";
import { badge } from "../../kit/badge.js";
import { emptyState } from "../../kit/empty-state.js";
import { html, type SafeHtml } from "../../kit/html.js";
import { pagination } from "../../kit/pagination.js";
import { pillGroup, type Pill } from "../../kit/pill-group.js";
import { countOf } from "../../text/count-of.js";
import { formatDate } from "../../text/format-date.js";
import { LABELS } from "../../text/labels.js";
import { describeHistory } from "./history-describe.js";
import { INSTALL_LINKS, type HistoryFilters, type InstallView } from "./install-view.js";
import { recordData } from "./record-data.js";
import { runLink } from "./run-link.js";

export interface HistorySectionInput {
  readonly view: InstallView;
  readonly history: Page<StoredHistoryRecord>;
  readonly breakdown: readonly HistoryBreakdownCell[];
}

const SECTION = INSTALL_LINKS.sections.history;
const ITEM_NOUN = { one: "élément", many: "éléments" };
const NO_FILTER = { kind: null, status: null } as const;

/** What the history would list under these filters, from the per-pair counts. */
function countWhere(
  breakdown: readonly HistoryBreakdownCell[], filters: Omit<HistoryFilters, "page">,
): number {
  return breakdown
    .filter((cell) => filters.kind === null || cell.kind === filters.kind)
    .filter((cell) => filters.status === null || cell.status === filters.status)
    .reduce((sum, cell) => sum + cell.count, 0);
}

function withHistory(input: HistorySectionInput, change: Partial<HistoryFilters>): string {
  const history = { ...input.view.history, page: 1, ...change };
  return INSTALL_LINKS.view({ ...input.view, history }, SECTION);
}

/** Kind pills count under the chosen status, status pills under the chosen kind. */
function kindPills(input: HistorySectionInput): readonly Pill[] {
  const { history } = input.view;
  return [null, ...JOURNAL_VOCABULARY.historyKinds].map((kind) => ({
    label: kind === null ? "Tout" : LABELS.historyKindFilter[kind],
    href: withHistory(input, { kind }),
    isCurrent: kind === history.kind,
    count: { value: countWhere(input.breakdown, { kind, status: history.status }) },
  }));
}

function statusPills(input: HistorySectionInput): readonly Pill[] {
  const { history } = input.view;
  return [null, ...JOURNAL_VOCABULARY.updateStatuses].map((status) => ({
    label: status === null ? "Tous" : LABELS.updateStatusFilter[status],
    href: withHistory(input, { status }),
    isCurrent: status === history.status,
    count: { value: countWhere(input.breakdown, { kind: history.kind, status }) },
  }));
}

/** Each cell holds one element or plain text: below 720 px, a row stacks into a card. */
function historyRow(installId: string, record: StoredHistoryRecord): SafeHtml {
  const description = describeHistory(record);
  const status = record.status === null ? "—" : badge({ family: "outcome", value: record.status });
  const message = description.message === null
    ? ""
    : html`<p class="cell-message">${description.message}</p>`;
  return html`<tr>
    <td class="nowrap" data-label="Date">${formatDate(record.ts, "second")}</td>
    <td data-label="Type">${badge({ family: "entry", value: record.kind })}</td>
    <td data-label="Statut">${status}</td>
    <td class="mono" data-label="Objet">${description.subject}</td>
    <td class="wrap" data-label="Détail"><div class="cell-stack">
      <span>${description.facts.join(" · ") || "—"}</span>${message}
      ${recordData(record.data)}</div></td>
    <td data-label="Exécution">${runLink(installId, record.runId)}</td>
  </tr>`;
}

function table(input: HistorySectionInput): SafeHtml {
  const { history, view } = input;
  if (history.items.length === 0) {
    const isFiltered = view.history.kind !== null || view.history.status !== null;
    return isFiltered
      ? emptyState({
        title: "Aucun élément d’historique ne correspond à ces filtres.",
        hint: "Un statut ne concerne que les mises à jour : une analyse n’en a pas.",
        action: { href: withHistory(input, NO_FILTER), label: "Retirer les filtres" },
      })
      : emptyState({
        title: "Aucun historique partagé.",
        hint: "Les analyses et mises à jour arrivent avec la synchronisation hebdomadaire.",
      });
  }
  return html`<div class="table-wrap"><table class="table table--stack">
    <caption class="sr-only">Historique, du plus récent au plus ancien</caption>
    <thead><tr><th scope="col">Date</th><th scope="col">Type</th><th scope="col">Statut</th>
      <th scope="col">Objet</th><th scope="col">Détail</th><th scope="col">Exécution</th></tr>
    </thead>
    <tbody>${history.items.map((record) => historyRow(view.installId, record))}</tbody>
  </table></div>`;
}

/** Every history item, newest first, filtered by kind and status and paginated. */
export function historySection(input: HistorySectionInput): SafeHtml {
  return html`<section class="section" id="${SECTION}" aria-labelledby="${SECTION}-title">
    <div class="section__head">
      <h2 class="section__title" id="${SECTION}-title">Historique</h2>
      <p class="section__note">${countOf(input.history.total, ITEM_NOUN)} sous ces filtres</p>
    </div>
    <div class="toolbar"><div class="toolbar__filters">
      ${pillGroup({ id: "history-kind", label: "Type", pills: kindPills(input) })}
      ${pillGroup({ id: "history-status", label: "Statut", pills: statusPills(input) })}
    </div></div>
    ${table(input)}
    ${pagination({
      page: input.history,
      hrefFor: (page) => withHistory(input, { page }),
      label: "Pages de l’historique",
    })}
  </section>`;
}
