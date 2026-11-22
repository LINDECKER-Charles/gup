import type { StoredHistoryRecord } from "../../ports/install-reader.js";
import type { Page } from "../../ports/page.js";
import { DURATION_MS } from "../../time-units.js";
import { emptyState } from "../kit/empty-state.js";
import { html, type SafeHtml } from "../kit/html.js";
import { formatDate } from "../text/format-date.js";

const SECONDS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

export interface HistorySectionsInput {
  readonly failedUpdates: Page<StoredHistoryRecord>;
  readonly scans: Page<StoredHistoryRecord>;
}

function text(record: StoredHistoryRecord, name: string): string | null {
  const value = record.data[name];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function seconds(record: StoredHistoryRecord): string {
  const value = record.data["durationMs"];
  return typeof value === "number" ? `${SECONDS.format(value / DURATION_MS.second)} s` : "—";
}

function versions(record: StoredHistoryRecord): string {
  return `${text(record, "from") ?? "?"} → ${text(record, "to") ?? "?"}`;
}

function providerErrors(record: StoredHistoryRecord): number {
  const providers = record.data["providers"];
  if (!Array.isArray(providers)) return 0;
  return providers.filter((provider: unknown) =>
    typeof provider === "object" && provider !== null && "error" in provider).length;
}

/** Each cell holds one element or plain text: below 720 px, a row stacks into a card. */
function failedRow(record: StoredHistoryRecord): SafeHtml {
  return html`<tr>
    <td class="nowrap" data-label="Date">${formatDate(record.ts)}</td>
    <td data-label="Source">${text(record, "providerId") ?? "—"}</td>
    <td class="mono" data-label="Paquet">${text(record, "packageId") ?? "—"}</td>
    <td class="mono" data-label="Versions">${versions(record)}</td>
    <td class="wrap" data-label="Message">${text(record, "message") ?? "—"}</td>
  </tr>`;
}

function scanRow(record: StoredHistoryRecord): SafeHtml {
  const providers = record.data["providers"];
  return html`<tr>
    <td class="nowrap" data-label="Date">${formatDate(record.ts)}</td>
    <td class="num" data-label="Durée">${seconds(record)}</td>
    <td class="num" data-label="En retard">${text(record, "outdated") ?? "—"}</td>
    <td class="num" data-label="Sources">${Array.isArray(providers) ? providers.length : "—"}</td>
    <td class="num" data-label="En erreur">${providerErrors(record)}</td>
  </tr>`;
}

interface HistoryTable {
  readonly id: string;
  readonly title: string;
  readonly empty: string;
  readonly head: SafeHtml;
  readonly row: (record: StoredHistoryRecord) => SafeHtml;
}

const FAILED: HistoryTable = {
  id: "echecs",
  title: "Mises à jour échouées",
  empty: "Aucune mise à jour échouée.",
  head: html`<th scope="col">Date</th><th scope="col">Source</th><th scope="col">Paquet</th>
    <th scope="col">Versions</th><th scope="col">Message</th>`,
  row: failedRow,
};

const SCANS: HistoryTable = {
  id: "analyses",
  title: "Analyses récentes",
  empty: "Aucune analyse partagée.",
  head: html`<th scope="col">Date</th><th scope="col" class="num">Durée</th>
    <th scope="col" class="num">Paquets en retard</th><th scope="col" class="num">Sources</th>
    <th scope="col" class="num">Sources en erreur</th>`,
  row: scanRow,
};

/** The latest records only; the note says how many the install holds in all. */
function section(spec: HistoryTable, page: Page<StoredHistoryRecord>): SafeHtml {
  const body = page.items.length === 0
    ? emptyState({ title: spec.empty })
    : html`<div class="table-wrap"><table class="table table--stack">
      <thead><tr>${spec.head}</tr></thead>
      <tbody>${page.items.map(spec.row)}</tbody></table></div>`;
  const note = page.total > page.items.length
    ? html`<p class="section__note">Les ${page.items.length} plus récentes sur ${page.total}</p>`
    : "";
  return html`<section class="section" id="${spec.id}" aria-labelledby="${spec.id}-title">
    <div class="section__head">
      <h2 class="section__title" id="${spec.id}-title">${spec.title}</h2>${note}
    </div>
    ${body}
  </section>`;
}

/** What the install's history says: failed updates first, then recent scans. */
export function historySections(input: HistorySectionsInput): SafeHtml {
  return html`${section(FAILED, input.failedUpdates)}${section(SCANS, input.scans)}`;
}
