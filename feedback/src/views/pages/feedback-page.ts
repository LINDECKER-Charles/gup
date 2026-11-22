import { FEEDBACK_VOCABULARY, type Feedback } from "../../domain/feedback.js";
import { ADMIN_UI } from "../admin-ui.js";
import { csrfField } from "../csrf-field.js";
import { badge } from "../kit/badge.js";
import { formatDate } from "../kit/format-date.js";
import { html, type SafeHtml } from "../kit/html.js";
import { LABELS } from "../kit/labels.js";
import { layout } from "../kit/layout.js";
import { notice } from "../kit/notice.js";

export interface FeedbackPageInput {
  readonly csrfToken: string;
  readonly feedback: Feedback;
  /** Whether the install the reporter named has shared journals. */
  readonly hasSharedJournals: boolean;
  readonly notice: string | null;
}

const NOT_GIVEN = html`<span class="muted">non renseigné</span>`;

function mailtoHref(feedback: Feedback, email: string): string {
  const address = encodeURIComponent(email).replace("%40", "@");
  return `mailto:${address}?subject=${encodeURIComponent(`Re: ${feedback.title}`)}`;
}

function installCell(input: FeedbackPageInput): SafeHtml {
  const { installId } = input.feedback;
  if (installId === null) return NOT_GIVEN;
  const journals = input.hasSharedJournals
    ? html`<a href="/admin/installs/${installId}">Voir ses journaux</a>`
    : html`<span class="muted">aucun journal partagé</span>`;
  return html`<code class="mono">${installId}</code><br>${journals}`;
}

function details(input: FeedbackPageInput): SafeHtml {
  const { feedback } = input;
  const email = feedback.email === null
    ? NOT_GIVEN
    : html`<a href="${mailtoHref(feedback, feedback.email)}">${feedback.email}</a>`;
  const platform = feedback.platform === null ? null : LABELS.platform[feedback.platform];
  return html`<dl class="facts">
    <dt>Adresse</dt><dd>${email}</dd>
    <dt>Installation</dt><dd>${installCell(input)}</dd>
    <dt>Version de gup</dt><dd>${feedback.gupVersion ?? NOT_GIVEN}</dd>
    <dt>Plateforme</dt><dd>${platform ?? NOT_GIVEN}</dd>
    <dt>Langue</dt><dd>${feedback.locale ?? NOT_GIVEN}</dd>
    <dt>Modifié le</dt><dd>${formatDate(feedback.updatedAt)}</dd>
  </dl>`;
}

function statusForm(input: FeedbackPageInput): SafeHtml {
  const options = FEEDBACK_VOCABULARY.statuses.map((status) => {
    const selected = status === input.feedback.status ? html` selected` : "";
    return html`<option value="${status}"${selected}>${LABELS.status[status]}</option>`;
  });
  return html`<form class="form form--inline" method="post"
      action="/admin/feedback/${input.feedback.id}/status">
    ${csrfField(input.csrfToken)}
    <div class="field">
      <label for="status">Statut</label>
      <select id="status" name="status">${options}</select>
    </div>
    <button class="button button--primary" type="submit">Enregistrer le statut</button>
  </form>`;
}

function noteForm(input: FeedbackPageInput): SafeHtml {
  return html`<form class="form" method="post" action="/admin/feedback/${input.feedback.id}/note">
    ${csrfField(input.csrfToken)}
    <div class="field">
      <label for="note">Note privée</label>
      <textarea id="note" name="note" rows="4"
        maxlength="${ADMIN_UI.maxNoteLength}"
        aria-describedby="note-hint">${input.feedback.note}</textarea>
      <p class="hint" id="note-hint">Visible ici seulement, jamais envoyée au rapporteur.</p>
    </div>
    <button class="button" type="submit">Enregistrer la note</button>
  </form>`;
}

function deleteForm(input: FeedbackPageInput): SafeHtml {
  return html`<form class="form danger" method="post"
      action="/admin/feedback/${input.feedback.id}/delete">
    ${csrfField(input.csrfToken)}
    <h2 class="section__title">Supprimer</h2>
    <div class="check">
      <input id="confirm-delete" name="confirm" type="checkbox"
        value="${ADMIN_UI.confirmed}" required>
      <label for="confirm-delete">Je confirme la suppression définitive de ce retour.</label>
    </div>
    <button class="button button--danger" type="submit">Supprimer ce retour</button>
  </form>`;
}

export function feedbackPage(input: FeedbackPageInput): string {
  const { feedback } = input;
  return layout({
    title: `#${feedback.id} ${feedback.title}`,
    signedIn: { csrfToken: input.csrfToken, section: "inbox" },
    main: html`<p><a class="back" href="${ADMIN_UI.home}">← Retours</a></p>
      <header class="page__header">
        <h1 class="page__title">${feedback.title}</h1>
        <p class="row__badges">${badge({ family: "kind", value: feedback.kind })}
          ${badge({ family: "status", value: feedback.status })}</p>
        <p class="muted">#${feedback.id} · reçu le ${formatDate(feedback.createdAt)}</p>
      </header>
      ${notice(input.notice)}
      <div class="split">
        <section class="card" aria-label="Message">
          <div class="message">${feedback.message}</div>
          ${details(input)}
        </section>
        <section class="card stack" aria-label="Traitement">
          ${statusForm(input)}
          ${noteForm(input)}
          ${deleteForm(input)}
        </section>
      </div>`,
  });
}
