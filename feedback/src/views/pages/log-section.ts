import { JOURNAL_VOCABULARY } from "../../domain/journal.js";
import type { StoredLogRecord } from "../../ports/install-reader.js";
import type { Page } from "../../ports/page.js";
import { ADMIN_UI } from "../admin-ui.js";
import { badge } from "../kit/badge.js";
import { emptyState } from "../kit/empty-state.js";
import { href } from "../kit/href.js";
import { html, type SafeHtml } from "../kit/html.js";
import { pagination } from "../kit/pagination.js";
import { countOf } from "../text/count-of.js";
import { formatDate } from "../text/format-date.js";
import { LABELS } from "../text/labels.js";

const JSON_INDENT = 2;
const ENTRY_NOUN = { one: "entrée", many: "entrées" };
const ERROR_RANK = JOURNAL_VOCABULARY.logLevels.indexOf("error");

export interface LogSectionInput {
  readonly installId: string;
  readonly logs: Page<StoredLogRecord>;
  /** The least verbose level shown: 0 = errors only … 4 = everything. */
  readonly maxLevelRank: number;
}

/** The section's URL at this level, anchored on the section itself. */
function logHref(installId: string, level: string | null, page = 1): string {
  return `${href(`${ADMIN_UI.home}/installs/${installId}`, { level, page })}#journal`;
}

/** ctx and data, the parts of a record that are not already on the line. */
function details(record: StoredLogRecord): SafeHtml {
  const { ctx, data } = record.data;
  if (ctx === undefined && data === undefined) return html``;
  const json = JSON.stringify({ ctx, data }, null, JSON_INDENT);
  return html`<details class="details"><summary>Détails</summary><pre>${json}</pre></details>`;
}

function logLine(record: StoredLogRecord): SafeHtml {
  const error = record.levelRank <= ERROR_RANK ? " log__line--error" : "";
  return html`<li class="log__line${error}">
    <time class="log__time" datetime="${record.ts.toISOString()}">
      ${formatDate(record.ts, "second")}</time>
    <span class="log__level">${badge({ family: "level", rank: record.levelRank })}</span>
    <div class="log__event"><code>${record.event}</code>${details(record)}</div>
  </li>`;
}

/** One pill per level: each shows that level and everything more severe. */
function levelFilter(input: LogSectionInput): SafeHtml {
  const pills = JOURNAL_VOCABULARY.logLevels.map((level, rank) => {
    const current = rank === input.maxLevelRank ? html` aria-current="page"` : "";
    return html`<a class="pill" href="${logHref(input.installId, level)}"${current}>
      ${LABELS.level[level]}</a>`;
  });
  return html`<nav class="filter" aria-labelledby="level-title">
    <span class="field-label" id="level-title">Niveau minimal</span>
    <div class="pills">${pills}</div>
  </nav>`;
}

function lines(logs: Page<StoredLogRecord>): SafeHtml {
  if (logs.items.length === 0) {
    return emptyState({
      title: "Aucune entrée à ce niveau.",
      hint: "Un niveau moins grave en montre davantage.",
    });
  }
  return html`<ol class="log">${logs.items.map(logLine)}</ol>`;
}

/** The install's debug log, filtered by minimum level and paginated. */
export function logSection(input: LogSectionInput): SafeHtml {
  const level = JOURNAL_VOCABULARY.logLevels[input.maxLevelRank] ?? null;
  return html`<section class="section" id="journal" aria-labelledby="journal-title">
    <div class="section__head">
      <h2 class="section__title" id="journal-title">Journal de débogage</h2>
      <p class="section__note">${countOf(input.logs.total, ENTRY_NOUN)} à ce niveau</p>
    </div>
    ${levelFilter(input)}
    ${lines(input.logs)}
    ${pagination({
      page: input.logs,
      hrefFor: (page) => logHref(input.installId, level, page),
      label: "Pages du journal",
    })}
  </section>`;
}
