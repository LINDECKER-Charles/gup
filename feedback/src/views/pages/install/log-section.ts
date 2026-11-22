import { JOURNAL_VOCABULARY } from "../../../domain/journal.js";
import type { StoredLogRecord } from "../../../ports/install-reader.js";
import type { Page } from "../../../ports/page.js";
import { ADMIN_UI } from "../../admin-ui.js";
import { emptyState } from "../../kit/empty-state.js";
import { html, type SafeHtml } from "../../kit/html.js";
import { pagination } from "../../kit/pagination.js";
import { pillGroup, type Pill } from "../../kit/pill-group.js";
import { countOf } from "../../text/count-of.js";
import { LABELS } from "../../text/labels.js";
import { INSTALL_LINKS, type InstallView, type LogFilters } from "./install-view.js";
import { logLine } from "./log-line.js";

export interface LogSectionInput {
  readonly view: InstallView;
  readonly logs: Page<StoredLogRecord>;
}

const SECTION = INSTALL_LINKS.sections.log;
const QUERY = ADMIN_UI.installQuery;
const ENTRY_NOUN = { one: "entrée", many: "entrées" };
const FOUND_NOUN = { one: "entrée trouvée", many: "entrées trouvées" };

function withLog(input: LogSectionInput, change: Partial<LogFilters>): string {
  const log = { ...input.view.log, page: 1, ...change };
  return INSTALL_LINKS.view({ ...input.view, log }, SECTION);
}

/** One pill per level: each shows that level and everything more severe. */
function levelPills(input: LogSectionInput): readonly Pill[] {
  return JOURNAL_VOCABULARY.logLevels.map((level, rank) => ({
    label: LABELS.level[level],
    href: withLog(input, { maxLevelRank: rank }),
    isCurrent: rank === input.view.log.maxLevelRank,
  }));
}

function hidden(name: string, value: string | number | null): SafeHtml {
  return value === null ? html`` : html`<input type="hidden" name="${name}" value="${value}">`;
}

/**
 * GET back to this page, on the log: the search keeps the level and the
 * whole history view, and starts the log over at its first page.
 */
function searchForm(input: LogSectionInput): SafeHtml {
  const { history, log } = input.view;
  return html`<form class="search" method="get"
      action="${INSTALL_LINKS.install(input.view.installId)}#${SECTION}" role="search">
    <label class="field-label" for="log-q">Rechercher dans le journal</label>
    <div class="search__row">
      <input class="field-control" id="log-q" name="${QUERY.search}" type="search"
        value="${log.search ?? ""}" maxlength="${ADMIN_UI.maxSearchLength}"
        aria-describedby="log-q-hint" autocomplete="off" spellcheck="false">
      <button class="btn btn--ghost" type="submit">Rechercher</button>
    </div>
    <p class="field-note" id="log-q-hint">Nom d’événement, clé ou valeur des données
      (paquet, code de sortie, chemin…), au niveau choisi.</p>
    ${hidden(QUERY.level, JOURNAL_VOCABULARY.logLevels[log.maxLevelRank] ?? null)}
    ${hidden(QUERY.kind, history.kind)}
    ${hidden(QUERY.status, history.status)}
    ${hidden(QUERY.historyPage, history.page === 1 ? null : history.page)}
  </form>`;
}

function results(input: LogSectionInput): SafeHtml {
  const { search } = input.view.log;
  if (search === null) return html``;
  return html`<p class="results">
    <span>${countOf(input.logs.total, FOUND_NOUN)} pour « ${search} »</span>
    <a href="${withLog(input, { search: null })}">Effacer la recherche</a>
  </p>`;
}

function lines(input: LogSectionInput): SafeHtml {
  if (input.logs.items.length > 0) {
    const options = { installId: input.view.installId, showRun: true };
    return html`<ol class="log">${input.logs.items.map((record) => logLine(record, options))}</ol>`;
  }
  if (input.view.log.search !== null) {
    return emptyState({
      title: "Aucune entrée ne correspond à cette recherche.",
      hint: "Un niveau moins grave en montre davantage.",
      action: { href: withLog(input, { search: null }), label: "Effacer la recherche" },
    });
  }
  return emptyState({
    title: "Aucune entrée à ce niveau.",
    hint: "Un niveau moins grave en montre davantage.",
  });
}

/** The install's debug log: minimum level, text search, paginated. */
export function logSection(input: LogSectionInput): SafeHtml {
  return html`<section class="section" id="${SECTION}" aria-labelledby="${SECTION}-title">
    <div class="section__head">
      <h2 class="section__title" id="${SECTION}-title">Journal de débogage</h2>
      <p class="section__note">${countOf(input.logs.total, ENTRY_NOUN)} à ce niveau</p>
    </div>
    <div class="toolbar">
      ${searchForm(input)}
      ${pillGroup({ id: "log-level", label: "Niveau minimal", pills: levelPills(input) })}
    </div>
    ${results(input)}
    ${lines(input)}
    ${pagination({
      page: input.logs,
      hrefFor: (page) => withLog(input, { page }),
      label: "Pages du journal",
    })}
  </section>`;
}
