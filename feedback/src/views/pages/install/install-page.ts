import type { Feedback } from "../../../domain/feedback.js";
import { dangerZone } from "../../danger-zone.js";
import { emptyState } from "../../kit/empty-state.js";
import { feedbackCard } from "../../kit/feedback-card.js";
import { html, type SafeHtml } from "../../kit/html.js";
import { layout } from "../../kit/layout.js";
import { pageHeader } from "../../kit/page-header.js";
import { historySection, type HistorySectionInput } from "./history-section.js";
import { installFacts, type InstallFactsInput } from "./install-facts.js";
import { INSTALL_LINKS } from "./install-view.js";
import { logSection, type LogSectionInput } from "./log-section.js";

export interface InstallPageInput extends InstallFactsInput, HistorySectionInput, LogSectionInput {
  readonly csrfToken: string;
  readonly feedback: readonly Feedback[];
}

/** A long page: one pill per section, with what it holds; each keeps the page's filters. */
function jumps(input: InstallPageInput): SafeHtml {
  const { sections } = INSTALL_LINKS;
  const targets = [
    { id: sections.feedback, label: "Retours liés", count: input.feedback.length },
    { id: sections.history, label: "Historique", count: input.install.historyCount },
    { id: sections.log, label: "Journal", count: input.install.logCount },
  ];
  return html`<nav class="jumps" aria-label="Sections de la page"><div class="pills">
    ${targets.map((target) => html`<a class="pill"
      href="${INSTALL_LINKS.view(input.view, target.id)}">${target.label}
      <span class="pill__count">${target.count}</span></a>`)}
  </div></nav>`;
}

function feedbackSection(feedback: readonly Feedback[]): SafeHtml {
  const id = INSTALL_LINKS.sections.feedback;
  const body = feedback.length === 0
    ? emptyState({ title: "Aucun retour ne cite cette installation." })
    : html`<ol class="rows">${feedback.map(feedbackCard)}</ol>`;
  return html`<section class="section" id="${id}" aria-labelledby="${id}-title">
    <div class="section__head">
      <h2 class="section__title" id="${id}-title">Retours liés</h2>
    </div>
    ${body}
  </section>`;
}

function eraseSection(input: InstallPageInput): SafeHtml {
  return html`<section class="section" aria-label="Effacement">${dangerZone({
    csrfToken: input.csrfToken,
    action: INSTALL_LINKS.erase(input.install.id),
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
      back: { href: INSTALL_LINKS.list, label: "Installations" },
      kicker: "02 / Installations",
      title: "Installation",
      meta: html`<span class="ident">${input.install.id}</span>`,
    })}
      ${jumps(input)}
      ${installFacts(input)}
      ${feedbackSection(input.feedback)}
      ${historySection(input)}
      ${logSection(input)}
      ${eraseSection(input)}`,
  });
}
