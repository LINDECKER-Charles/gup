import type { InstallSummary, JournalSpan } from "../../../ports/install-reader.js";
import { DURATION_MS } from "../../../time-units.js";
import { html, type SafeHtml } from "../../kit/html.js";
import { countOf } from "../../text/count-of.js";
import { formatDate } from "../../text/format-date.js";
import { LABELS } from "../../text/labels.js";
import { INSTALL_LINKS } from "./install-view.js";

export interface InstallFactsInput {
  readonly install: InstallSummary;
  readonly span: JournalSpan;
  /** `LOG_RETENTION_DAYS`: an item goes that long after it was received. */
  readonly retentionDays: number;
}

const UNKNOWN = html`<span class="muted">inconnu</span>`;
const NOUNS = {
  item: { one: "élément", many: "éléments" },
  line: { one: "ligne", many: "lignes" },
  feedback: { one: "retour", many: "retours" },
  run: { one: "exécution", many: "exécutions" },
  day: { one: "jour", many: "jours" },
};

function fact(term: string, value: SafeHtml | string, isWide = false): SafeHtml {
  const wide = isWide ? " facts__item--wide" : "";
  return html`<div class="facts__item${wide}"><dt>${term}</dt><dd>${value}</dd></div>`;
}

function platformOf(install: InstallSummary): string | null {
  if (install.platform === null) return null;
  const name = LABELS.platform[install.platform] ?? install.platform;
  return install.arch === null ? name : `${name} (${install.arch})`;
}

function coverage(span: JournalSpan): SafeHtml | string {
  if (span.oldestAt === null || span.newestAt === null) {
    return html`<span class="muted">aucun élément conservé</span>`;
  }
  return `du ${formatDate(span.oldestAt)} au ${formatDate(span.newestAt)}`;
}

/** The rule, then when it next bites this install. */
function retention(input: InstallFactsInput): string {
  const rule = `${countOf(input.retentionDays, NOUNS.day)} après réception`;
  const received = input.span.oldestReceivedAt;
  if (received === null) return rule;
  const purge = new Date(received.getTime() + input.retentionDays * DURATION_MS.day);
  return `${rule} ; le plus ancien, reçu le ${formatDate(received)}, part vers le `
    + `${formatDate(purge)}`;
}

function machineFacts(install: InstallSummary): SafeHtml {
  return html`${fact("Dernier envoi", formatDate(install.lastSeenAt))}
    ${fact("Premier envoi", formatDate(install.firstSeenAt))}
    ${fact("Version de gup", install.gupVersion ?? UNKNOWN)}
    ${fact("Plateforme", platformOf(install) ?? UNKNOWN)}
    ${fact("Node.js", install.node ?? UNKNOWN)}
    ${fact("Langue", install.locale ?? UNKNOWN)}`;
}

function journalFacts(input: InstallFactsInput): SafeHtml {
  const { install, span } = input;
  return html`${fact("Historique", countOf(install.historyCount, NOUNS.item))}
    ${fact("Journal", countOf(install.logCount, NOUNS.line))}
    ${fact("Retours liés", countOf(install.feedbackCount, NOUNS.feedback))}
    ${fact("Exécutions", countOf(span.runCount, NOUNS.run))}
    ${fact("Période couverte", coverage(span), true)}
    ${fact("Conservation", retention(input), true)}`;
}

/** Everything known about the install, and the way to take all of it away. */
export function installFacts(input: InstallFactsInput): SafeHtml {
  return html`<section class="panel" aria-labelledby="facts-title">
    <h2 class="panel__title" id="facts-title">Fiche de l’installation</h2>
    <dl class="facts">${machineFacts(input.install)}${journalFacts(input)}</dl>
    <div class="panel__actions">
      <a class="btn btn--ghost btn--small" href="${INSTALL_LINKS.export(input.install.id)}"
        download>Exporter tout (JSON Lines)</a>
      <span class="field-note">Installation, retours, historique et journal complets.</span>
    </div>
  </section>`;
}
