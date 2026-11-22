import { FEEDBACK_VOCABULARY, type Feedback } from "../../domain/feedback.js";
import { ADMIN_UI } from "../admin-ui.js";
import { csrfField } from "../csrf-field.js";
import { dangerZone } from "../danger-zone.js";
import { html, type SafeHtml } from "../kit/html.js";
import { LABELS } from "../text/labels.js";

export interface FeedbackActionsInput {
  readonly csrfToken: string;
  readonly feedback: Feedback;
}

function actionPath(feedback: Feedback, action: string): string {
  return `${ADMIN_UI.home}/feedback/${feedback.id}/${action}`;
}

/** One click sets the status: each status is a submit button, the current one pressed. */
function statusPart(input: FeedbackActionsInput): SafeHtml {
  const buttons = FEEDBACK_VOCABULARY.statuses.map((status) => {
    const pressed = status === input.feedback.status ? "true" : "false";
    return html`<button class="choice" type="submit" name="status" value="${status}"
      aria-pressed="${pressed}">${LABELS.status[status]}</button>`;
  });
  return html`<form class="panel__part" method="post"
      action="${actionPath(input.feedback, "status")}">
    ${csrfField(input.csrfToken)}
    <h2 class="panel__title" id="status-title">Statut</h2>
    <div class="choices" role="group" aria-labelledby="status-title">${buttons}</div>
  </form>`;
}

function notePart(input: FeedbackActionsInput): SafeHtml {
  return html`<form class="panel__part form" method="post"
      action="${actionPath(input.feedback, "note")}">
    ${csrfField(input.csrfToken)}
    <div class="field">
      <label class="panel__title" for="note">Note privée</label>
      <textarea class="field-control" id="note" name="note" rows="5"
        maxlength="${ADMIN_UI.maxNoteLength}"
        aria-describedby="note-hint">${input.feedback.note}</textarea>
      <p class="field-note" id="note-hint">Visible ici seulement, jamais envoyée à l’auteur.</p>
    </div>
    <button class="btn btn--ghost btn--small" type="submit">Enregistrer la note</button>
  </form>`;
}

/** The side panel of a feedback: status, private note, deletion. */
export function feedbackActions(input: FeedbackActionsInput): SafeHtml {
  return html`<aside class="panel detail__side" aria-label="Traitement">
    ${statusPart(input)}
    ${notePart(input)}
    <div class="panel__part">${dangerZone({
      csrfToken: input.csrfToken,
      action: actionPath(input.feedback, "delete"),
      id: "delete",
      summary: "Supprimer ce retour",
      consequence: "Le retour et sa note disparaissent pour de bon. "
        + "L’installation et ses journaux restent.",
      confirmation: "Je confirme la suppression définitive de ce retour.",
      button: "Supprimer définitivement",
    })}</div>
  </aside>`;
}
