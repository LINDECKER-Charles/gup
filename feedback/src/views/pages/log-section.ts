import { JOURNAL_VOCABULARY } from "../../domain/journal.js";
import type { StoredLogRecord } from "../../ports/install-reader.js";
import type { Page } from "../../ports/page.js";
import { badge } from "../kit/badge.js";
import { emptyState } from "../kit/empty-state.js";
import { formatDate } from "../kit/format-date.js";
import { href } from "../kit/href.js";
import { html, type SafeHtml } from "../kit/html.js";
import { LABELS } from "../kit/labels.js";
import { pagination } from "../kit/pagination.js";

const JSON_INDENT = 2;

export interface LogSectionInput {
  readonly installId: string;
  readonly logs: Page<StoredLogRecord>;
  /** The least verbose level shown: 0 = errors only … 4 = everything. */
  readonly maxLevelRank: number;
}

/** ctx and data, the parts of a record that are not already in the row. */
function details(record: StoredLogRecord): SafeHtml {
  const { ctx, data } = record.data;
  if (ctx === undefined && data === undefined) return html``;
  const json = JSON.stringify({ ctx, data }, null, JSON_INDENT);
  return html`<details class="details"><summary>Détails</summary><pre>${json}</pre></details>`;
}

function logRow(record: StoredLogRecord): SafeHtml {
  return html`<tr>
    <td class="nowrap">${formatDate(record.ts, "second")}</td>
    <td>${badge({ family: "level", rank: record.levelRank })}</td>
    <td class="wrap"><code class="mono">${record.event}</code>${details(record)}</td>
  </tr>`;
}

function levelFilter(input: LogSectionInput): SafeHtml {
  const options = JOURNAL_VOCABULARY.logLevels.map((level, rank) => {
    const selected = rank === input.maxLevelRank ? html` selected` : "";
    return html`<option value="${level}"${selected}>${LABELS.level[level]} et plus grave</option>`;
  });
  return html`<form class="form form--inline" method="get"
      action="/admin/installs/${input.installId}#journal">
    <div class="field">
      <label for="level">Niveau minimal</label>
      <select id="level" name="level">${options}</select>
    </div>
    <button class="button" type="submit">Filtrer</button>
  </form>`;
}

function table(logs: Page<StoredLogRecord>): SafeHtml {
  if (logs.items.length === 0) return emptyState("Aucune entrée à ce niveau.");
  return html`<div class="table-wrap"><table class="table">
    <thead><tr><th scope="col">Heure</th><th scope="col">Niveau</th>
      <th scope="col">Évènement</th></tr></thead>
    <tbody>${logs.items.map(logRow)}</tbody>
  </table></div>`;
}

/** The install's debug log, filtered by minimum level and paginated. */
export function logSection(input: LogSectionInput): SafeHtml {
  const level = JOURNAL_VOCABULARY.logLevels[input.maxLevelRank] ?? null;
  const pageHref = (page: number) =>
    `${href(`/admin/installs/${input.installId}`, { level, page })}#journal`;
  return html`<section class="section" id="journal" aria-labelledby="journal-title">
    <h2 class="section__title" id="journal-title">Journal de débogage</h2>
    ${levelFilter(input)}
    ${table(input.logs)}
    ${pagination({ page: input.logs, hrefFor: pageHref, label: "Pages du journal" })}
  </section>`;
}
