import type { StoredHistoryRecord } from "../../ports/install-reader.js";
import type { Page } from "../../ports/page.js";
import { DURATION_MS } from "../../time-units.js";
import { emptyState } from "../kit/empty-state.js";
import { formatDate } from "../kit/format-date.js";
import { html, type SafeHtml } from "../kit/html.js";

const SECONDS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

function text(record: StoredHistoryRecord, name: string): string | null {
  const value = record.data[name];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}

function seconds(record: StoredHistoryRecord): string {
  const value = record.data["durationMs"];
  return typeof value === "number" ? `${SECONDS.format(value / DURATION_MS.second)} s` : "—";
}

function versions(record: StoredHistoryRecord): string {
  const from = text(record, "from") ?? "?";
  const to = text(record, "to") ?? "?";
  return `${from} → ${to}`;
}

function failedRow(record: StoredHistoryRecord): SafeHtml {
  return html`<tr>
    <td>${formatDate(record.ts)}</td>
    <td>${text(record, "providerId") ?? "—"}</td>
    <td class="mono">${text(record, "packageId") ?? "—"}</td>
    <td class="mono">${versions(record)}</td>
    <td class="wrap">${text(record, "message") ?? "—"}</td>
  </tr>`;
}

function providerErrors(record: StoredHistoryRecord): number {
  const providers = record.data["providers"];
  if (!Array.isArray(providers)) return 0;
  return providers.filter((provider: unknown) =>
    typeof provider === "object" && provider !== null && "error" in provider).length;
}

function scanRow(record: StoredHistoryRecord): SafeHtml {
  const providers = record.data["providers"];
  return html`<tr>
    <td>${formatDate(record.ts)}</td>
    <td class="num">${seconds(record)}</td>
    <td class="num">${text(record, "outdated") ?? "—"}</td>
    <td class="num">${Array.isArray(providers) ? providers.length : "—"}</td>
    <td class="num">${providerErrors(record)}</td>
  </tr>`;
}

export interface HistorySectionsInput {
  readonly failedUpdates: Page<StoredHistoryRecord>;
  readonly scans: Page<StoredHistoryRecord>;
}

function failedSection(page: Page<StoredHistoryRecord>): SafeHtml {
  const body = page.items.length === 0
    ? emptyState("Aucune mise à jour échouée.")
    : html`<div class="table-wrap"><table class="table">
      <thead><tr><th scope="col">Date</th><th scope="col">Source</th>
        <th scope="col">Paquet</th><th scope="col">Versions</th>
        <th scope="col">Message</th></tr></thead>
      <tbody>${page.items.map(failedRow)}</tbody></table></div>`;
  const more = page.total > page.items.length
    ? html`<p class="hint">Les ${page.items.length} plus récentes sur ${page.total}.</p>` : "";
  return html`<section class="section" aria-labelledby="failed-title">
    <h2 class="section__title" id="failed-title">Mises à jour échouées</h2>${body}${more}
  </section>`;
}

function scanSection(page: Page<StoredHistoryRecord>): SafeHtml {
  const body = page.items.length === 0
    ? emptyState("Aucune analyse partagée.")
    : html`<div class="table-wrap"><table class="table">
      <thead><tr><th scope="col">Date</th><th scope="col" class="num">Durée</th>
        <th scope="col" class="num">Paquets en retard</th><th scope="col" class="num">Sources</th>
        <th scope="col" class="num">Sources en erreur</th></tr></thead>
      <tbody>${page.items.map(scanRow)}</tbody></table></div>`;
  return html`<section class="section" aria-labelledby="scans-title">
    <h2 class="section__title" id="scans-title">Analyses récentes</h2>${body}
  </section>`;
}

/** What the install's history says: failed updates first, then recent scans. */
export function historySections(input: HistorySectionsInput): SafeHtml {
  return html`${failedSection(input.failedUpdates)}${scanSection(input.scans)}`;
}
