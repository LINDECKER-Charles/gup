import type { Feedback } from "../../domain/feedback.js";
import type { InstallSummary } from "../../ports/install-reader.js";
import { ADMIN_UI } from "../admin-ui.js";
import { dangerZone } from "../danger-zone.js";
import { emptyState } from "../kit/empty-state.js";
import { feedbackCard } from "../kit/feedback-card.js";
import { html, type SafeHtml } from "../kit/html.js";
import { layout } from "../kit/layout.js";
import { pageHeader } from "../kit/page-header.js";
import { formatDate } from "../text/format-date.js";
import { LABELS } from "../text/labels.js";
import { historySections, type HistorySectionsInput } from "./history-sections.js";
import { logSection, type LogSectionInput } from "./log-section.js";

export interface InstallPageInput extends HistorySectionsInput, LogSectionInput {
  readonly csrfToken: string;
  readonly install: InstallSummary;
  readonly feedback: readonly Feedback[];
}

const INSTALLS_PATH = `${ADMIN_UI.home}/installs`;
const UNKNOWN = html`<span class="muted">inconnu</span>`;

function fact(term: string, value: SafeHtml | string): SafeHtml {
  return html`<div class="facts__item"><dt>${term}</dt><dd>${value}</dd></div>`;
}

function platformOf(install: InstallSummary): string | null {
  if (install.platform === null) return null;
  const name = LABELS.platform[install.platform] ?? install.platform;
  return install.arch === null ? name : `${name} (${install.arch})`;
}

function factsPanel(install: InstallSummary): SafeHtml {
  return html`<section class="panel" aria-label="Fiche de l’installation">
    <dl class="facts">
      ${fact("Dernier envoi", formatDate(install.lastSeenAt))}
      ${fact("Premier envoi", formatDate(install.firstSeenAt))}
      ${fact("Version de gup", install.gupVersion ?? UNKNOWN)}
      ${fact("Plateforme", platformOf(install) ?? UNKNOWN)}
      ${fact("Node.js", install.node ?? UNKNOWN)}
      ${fact("Langue", install.locale ?? UNKNOWN)}
    </dl>
  </section>`;
}

/** A long page: one pill per section, with what it holds. */
function jumps(input: InstallPageInput): SafeHtml {
  const targets = [
    { id: "retours", label: "Retours liés", count: input.feedback.length },
    { id: "echecs", label: "Mises à jour échouées", count: input.failedUpdates.total },
    { id: "analyses", label: "Analyses", count: input.scans.total },
    { id: "journal", label: "Journal", count: input.logs.total },
  ];
  return html`<nav class="jumps" aria-label="Sections de la page"><div class="pills">
    ${targets.map((target) => html`<a class="pill" href="#${target.id}">${target.label}
      <span class="pill__count">${target.count}</span></a>`)}
  </div></nav>`;
}

function feedbackSection(feedback: readonly Feedback[]): SafeHtml {
  const body = feedback.length === 0
    ? emptyState({ title: "Aucun retour ne cite cette installation." })
    : html`<ol class="rows">${feedback.map(feedbackCard)}</ol>`;
  return html`<section class="section" id="retours" aria-labelledby="retours-title">
    <div class="section__head">
      <h2 class="section__title" id="retours-title">Retours liés</h2>
    </div>
    ${body}
  </section>`;
}

function eraseSection(input: InstallPageInput): SafeHtml {
  return html`<section class="section" aria-label="Effacement">${dangerZone({
    csrfToken: input.csrfToken,
    action: `${INSTALLS_PATH}/${input.install.id}/erase`,
    id: "erase",
    summary: "Effacer cette installation",
    consequence: "L’installation et tous ses journaux sont supprimés pour de bon. "
      + "Les retours qui la citent restent.",
    confirmation: "Je confirme l’effacement définitif de ces journaux.",
    button: "Effacer définitivement",
  })}</section>`;
}

export function installPage(input: InstallPageInput): string {
  return layout({
    title: `Installation ${input.install.id}`,
    signedIn: { csrfToken: input.csrfToken, section: "installs" },
    main: html`${pageHeader({
      back: { href: INSTALLS_PATH, label: "Installations" },
      kicker: "02 / Installations",
      title: "Installation",
      meta: html`<span class="ident">${input.install.id}</span>`,
    })}
      ${jumps(input)}
      ${factsPanel(input.install)}
      ${feedbackSection(input.feedback)}
      ${historySections(input)}
      ${logSection(input)}
      ${eraseSection(input)}`,
  });
}
