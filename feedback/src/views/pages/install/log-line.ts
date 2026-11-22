import { JOURNAL_VOCABULARY } from "../../../domain/journal.js";
import type { StoredLogRecord } from "../../../ports/install-reader.js";
import { badge } from "../../kit/badge.js";
import { html, type SafeHtml } from "../../kit/html.js";
import { formatDate } from "../../text/format-date.js";
import { recordData } from "./record-data.js";
import { runLink } from "./run-link.js";

const ERROR_RANK = JOURNAL_VOCABULARY.logLevels.indexOf("error");

export interface LogLineOptions {
  readonly installId: string;
  /** false inside a run's own page, where the link would lead back to itself. */
  readonly showRun: boolean;
}

/** One debug-log record: time, level, event, its run and the whole record folded. */
export function logLine(record: StoredLogRecord, options: LogLineOptions): SafeHtml {
  const error = record.levelRank <= ERROR_RANK ? " log__line--error" : "";
  const run = options.showRun
    ? html`<span class="log__run">exécution ${runLink(options.installId, record.runId)}</span>`
    : "";
  return html`<li class="log__line${error}">
    <time class="log__time" datetime="${record.ts.toISOString()}">
      ${formatDate(record.ts, "second")}</time>
    <span class="log__level">${badge({ family: "level", rank: record.levelRank })}</span>
    <div class="log__event"><code>${record.event}</code>${run}${recordData(record.data)}</div>
  </li>`;
}
