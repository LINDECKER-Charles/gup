import type { Feedback } from "../../domain/feedback.js";
import { ADMIN_UI } from "../admin-ui.js";
import { formatDate } from "../text/format-date.js";
import { LABELS } from "../text/labels.js";
import { badge } from "./badge.js";
import { html, type SafeHtml } from "./html.js";

/** Two lines of the card show about this much. */
const EXCERPT_LENGTH = 220;

function excerpt(message: string): string {
  const flat = message.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH)}…` : flat;
}

/** What came with the feedback, as chips; nothing when it came alone. */
function context(feedback: Feedback): SafeHtml {
  const platform = feedback.platform === null ? null : LABELS.platform[feedback.platform];
  const chips = [
    feedback.gupVersion === null ? null : `gup ${feedback.gupVersion}`,
    platform ?? null,
    feedback.installId === null ? null : "Installation liée",
    feedback.email === null ? null : "Adresse fournie",
  ].filter((chip) => chip !== null);
  if (chips.length === 0) return html``;
  return html`<ul class="chips">${chips.map((chip) => html`<li class="chip">${chip}</li>`)}</ul>`;
}

/**
 * A feedback in a list: number, kind, status, date, title, the start of the
 * message and its context. The title is the link; its target covers the card.
 */
export function feedbackCard(feedback: Feedback): SafeHtml {
  const edge = feedback.status === "new" ? " row--new" : "";
  const link = `${ADMIN_UI.home}/feedback/${feedback.id}`;
  return html`<li class="row${edge}">
    <div class="row__top">
      <span class="row__id">#${feedback.id}</span>
      <span class="badges">${badge({ family: "kind", value: feedback.kind })}
        ${badge({ family: "status", value: feedback.status })}</span>
      <span class="row__date">${formatDate(feedback.createdAt)}</span>
    </div>
    <h2 class="row__title"><a href="${link}">${feedback.title}</a></h2>
    <p class="row__excerpt">${excerpt(feedback.message)}</p>
    ${context(feedback)}
  </li>`;
}
