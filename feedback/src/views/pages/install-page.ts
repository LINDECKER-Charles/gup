import type { Feedback } from "../../domain/feedback.js";
import type { InstallSummary } from "../../ports/install-reader.js";
import { ADMIN_UI } from "../admin-ui.js";
import { csrfField } from "../csrf-field.js";
import { badge } from "../kit/badge.js";
import { emptyState } from "../kit/empty-state.js";
import { formatDate } from "../kit/format-date.js";
import { html, type SafeHtml } from "../kit/html.js";
import { LABELS } from "../kit/labels.js";
import { layout } from "../kit/layout.js";
import { historySections, type HistorySectionsInput } from "./history-sections.js";
import { logSection, type LogSectionInput } from "./log-section.js";

export interface InstallPageInput extends HistorySectionsInput, LogSectionInput {
  readonly csrfToken: string;
  readonly install: InstallSummary;
  readonly feedback: readonly Feedback[];
}

const UNKNOWN = html`<span class="muted">inconnu</span>`;

function facts(install: InstallSummary): SafeHtml {
  const platform = install.platform === null ? null : LABELS.platform[install.platform];
  return html`<dl class="facts facts--grid">
    <dt>Dernier envoi</dt><dd>${formatDate(install.lastSeenAt)}</dd>
    <dt>Premier envoi</dt><dd>${formatDate(install.firstSeenAt)}</dd>
    <dt>Version de gup</dt><dd>${install.gupVersion ?? UNKNOWN}</dd>
    <dt>Plateforme</dt><dd>${platform ?? install.platform ?? UNKNOWN}
      ${install.arch === null ? "" : `(${install.arch})`}</dd>
    <dt>Node.js</dt><dd>${install.node ?? UNKNOWN}</dd>
    <dt>Langue</dt><dd>${install.locale ?? UNKNOWN}</dd>
  </dl>`;
}

function feedbackSection(feedback: readonly Feedback[]): SafeHtml {
  const rows = feedback.map((item) => html`<li class="row"><a class="row__link"
      href="/admin/feedback/${item.id}">
    <span class="row__head"><span class="row__title">${item.title}</span>
      <span class="row__badges">${badge({ family: "kind", value: item.kind })}
        ${badge({ family: "status", value: item.status })}</span></span>
    <span class="row__meta">#${item.id} · ${formatDate(item.createdAt)}</span></a></li>`);
  const body = feedback.length === 0
    ? emptyState("Aucun retour ne cite cette installation.")
    : html`<ol class="rows">${rows}</ol>`;
  return html`<section class="section" aria-labelledby="feedback-title">
    <h2 class="section__title" id="feedback-title">Retours liés</h2>${body}
  </section>`;
}

function eraseForm(input: InstallPageInput): SafeHtml {
  return html`<section class="section">
    <form class="form danger" method="post" action="/admin/installs/${input.install.id}/erase">
      ${csrfField(input.csrfToken)}
      <h2 class="section__title">Effacer</h2>
      <p class="hint">Supprime l’installation et tous ses journaux. Les retours sont conservés.</p>
      <div class="check">
        <input id="confirm-erase" name="confirm" type="checkbox"
          value="${ADMIN_UI.confirmed}" required>
        <label for="confirm-erase">Je confirme l’effacement définitif de ces journaux.</label>
      </div>
      <button class="button button--danger" type="submit">Effacer l’installation</button>
    </form>
  </section>`;
}

export function installPage(input: InstallPageInput): string {
  return layout({
    title: `Installation ${input.install.id}`,
    signedIn: { csrfToken: input.csrfToken, section: "installs" },
    main: html`<p><a class="back" href="/admin/installs">← Installations</a></p>
      <header class="page__header">
        <h1 class="page__title">Installation</h1>
        <p><code class="mono">${input.install.id}</code></p>
      </header>
      <section class="card">${facts(input.install)}</section>
      ${feedbackSection(input.feedback)}
      ${historySections(input)}
      ${logSection(input)}
      ${eraseForm(input)}`,
  });
}
