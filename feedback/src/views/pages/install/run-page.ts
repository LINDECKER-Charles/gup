import type {
  RunEntry, RunSummary, StoredHistoryRecord,
} from "../../../ports/install-reader.js";
import type { Page } from "../../../ports/page.js";
import { badge } from "../../kit/badge.js";
import { href } from "../../kit/href.js";
import { html, type SafeHtml } from "../../kit/html.js";
import { layout } from "../../kit/layout.js";
import { pageHeader } from "../../kit/page-header.js";
import { pagination } from "../../kit/pagination.js";
import { countOf } from "../../text/count-of.js";
import { formatDate } from "../../text/format-date.js";
import { formatDuration } from "../../text/format-duration.js";
import { LABELS } from "../../text/labels.js";
import { describeHistory } from "./history-describe.js";
import { INSTALL_LINKS } from "./install-view.js";
import { logLine } from "./log-line.js";
import { recordData } from "./record-data.js";

export interface RunPageInput {
  readonly csrfToken: string;
  readonly run: RunSummary;
  readonly entries: Page<RunEntry>;
}

const FAILED_STATUS = "failed";
const NOUNS = {
  item: { one: "élément", many: "éléments" },
  line: { one: "ligne", many: "lignes" },
  error: { one: "erreur", many: "erreurs" },
};

function fact(term: string, value: SafeHtml | string): SafeHtml {
  return html`<div class="facts__item"><dt>${term}</dt><dd>${value}</dd></div>`;
}

function factsPanel(run: RunSummary): SafeHtml {
  const span = run.endedAt.getTime() - run.startedAt.getTime();
  const install = html`<a class="mono" href="${INSTALL_LINKS.install(run.installId)}"
    >${run.installId}</a>`;
  return html`<section class="panel" aria-labelledby="run-facts-title">
    <h2 class="panel__title" id="run-facts-title">Résumé de l’exécution</h2>
    <dl class="facts">
      ${fact("Début", formatDate(run.startedAt, "second"))}
      ${fact("Fin", formatDate(run.endedAt, "second"))}
      ${fact("Durée enregistrée", formatDuration(span))}
      ${fact("Historique", countOf(run.historyCount, NOUNS.item))}
      ${fact("Journal", countOf(run.logCount, NOUNS.line))}
      ${fact("Erreurs", countOf(run.errorCount, NOUNS.error))}
      ${fact("Mises à jour échouées", String(run.failedUpdateCount))}
      ${fact("Installation", install)}
    </dl>
  </section>`;
}

/**
 * A history record among the log lines: its status (a scan's kind) where a
 * line has its level, then what it is about.
 */
function historyLine(record: StoredHistoryRecord): SafeHtml {
  const description = describeHistory(record);
  const marker = record.status === null
    ? badge({ family: "entry", value: record.kind })
    : badge({ family: "outcome", value: record.status });
  const failed = record.status === FAILED_STATUS ? " log__line--error" : "";
  const facts = [description.subject, ...description.facts].join(" · ");
  const message = description.message === null
    ? ""
    : html`<p class="cell-message">${description.message}</p>`;
  return html`<li class="log__line log__line--history${failed}">
    <time class="log__time" datetime="${record.ts.toISOString()}">
      ${formatDate(record.ts, "second")}</time>
    <span class="log__level">${marker}</span>
    <div class="log__event"><strong>${LABELS.historyKind[record.kind]}</strong>
      <span class="log__facts">${facts}</span>${message}${recordData(record.data)}</div>
  </li>`;
}

function entryLine(run: RunSummary, entry: RunEntry): SafeHtml {
  return entry.source === "history"
    ? historyLine(entry.record)
    : logLine(entry.record, { installId: run.installId, showRun: false });
}

function story(input: RunPageInput): SafeHtml {
  const { run, entries } = input;
  return html`<section class="section" id="deroule" aria-labelledby="deroule-title">
    <div class="section__head">
      <h2 class="section__title" id="deroule-title">Déroulé</h2>
      <p class="section__note">${countOf(entries.total, NOUNS.item)}, du plus ancien au plus
        récent, tous niveaux</p>
    </div>
    <ol class="log">${entries.items.map((entry) => entryLine(run, entry))}</ol>
    ${pagination({
      page: entries,
      hrefFor: (page) => `${href(INSTALL_LINKS.run(run.installId, run.runId), { page })}#deroule`,
      label: "Pages du déroulé",
    })}
  </section>`;
}

/** One run of gup end to end: its history records and log lines, merged in time order. */
export function runPage(input: RunPageInput): string {
  const { run } = input;
  return layout({
    title: `Exécution ${run.runId}`,
    signedIn: { csrfToken: input.csrfToken, section: "installs" },
    main: html`${pageHeader({
      back: {
        href: `${INSTALL_LINKS.install(run.installId)}#${INSTALL_LINKS.sections.history}`,
        label: "Installation",
      },
      kicker: "02 / Installations / Exécution",
      title: "Exécution",
      meta: html`<span class="ident">${run.runId}</span>`,
    })}
      ${factsPanel(run)}
      ${story(input)}`,
  });
}
