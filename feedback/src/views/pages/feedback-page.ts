import type { Feedback } from "../../domain/feedback.js";
import { ADMIN_UI } from "../admin-ui.js";
import { badge } from "../kit/badge.js";
import { html, type SafeHtml } from "../kit/html.js";
import { layout } from "../kit/layout.js";
import { notice } from "../kit/notice.js";
import { pageHeader } from "../kit/page-header.js";
import { formatDate } from "../text/format-date.js";
import { LABELS } from "../text/labels.js";
import { feedbackActions } from "./feedback-actions.js";

export interface FeedbackPageInput {
  readonly csrfToken: string;
  readonly feedback: Feedback;
  /** Whether the install the reporter named has shared journals. */
  readonly hasSharedJournals: boolean;
  readonly notice: string | null;
}

const NOT_GIVEN = html`<span class="muted">non renseigné</span>`;

function mailtoHref(feedback: Feedback, email: string): string {
  const address = encodeURIComponent(email).replaceAll("%40", "@");
  return `mailto:${address}?subject=${encodeURIComponent(`Re: ${feedback.title}`)}`;
}

/** Answering is the page's main gesture, when the reporter left an address. */
function reply(feedback: Feedback): SafeHtml {
  if (feedback.email === null) {
    return html`<p class="field-note">
      Pas d’adresse : l’auteur ne peut pas recevoir de réponse.</p>`;
  }
  return html`<a class="btn btn--primary" href="${mailtoHref(feedback, feedback.email)}">
    Répondre par mail</a>`;
}

function fact(term: string, value: SafeHtml | string, isWide = false): SafeHtml {
  const wide = isWide ? " facts__item--wide" : "";
  return html`<div class="facts__item${wide}"><dt>${term}</dt><dd>${value}</dd></div>`;
}

function installValue(input: FeedbackPageInput): SafeHtml {
  const { installId } = input.feedback;
  if (installId === null) return NOT_GIVEN;
  const journals = input.hasSharedJournals
    ? html`<a href="${ADMIN_UI.home}/installs/${installId}">Voir ses journaux</a>`
    : html`<span class="muted">Aucun journal partagé</span>`;
  return html`<span class="ident">${installId}</span><br>${journals}`;
}

function contextPanel(input: FeedbackPageInput): SafeHtml {
  const { feedback } = input;
  const email = feedback.email === null
    ? NOT_GIVEN
    : html`<a href="${mailtoHref(feedback, feedback.email)}">${feedback.email}</a>`;
  const platform = feedback.platform === null ? null : LABELS.platform[feedback.platform];
  return html`<section class="panel" aria-labelledby="context-title">
    <h2 class="panel__title" id="context-title">Contexte</h2>
    <dl class="facts">
      ${fact("Adresse", email, true)}
      ${fact("Installation", installValue(input), true)}
      ${fact("Version de gup", feedback.gupVersion ?? NOT_GIVEN)}
      ${fact("Plateforme", platform ?? NOT_GIVEN)}
      ${fact("Langue", feedback.locale ?? NOT_GIVEN)}
      ${fact("Modifié le", formatDate(feedback.updatedAt))}
    </dl>
  </section>`;
}

function messagePanel(feedback: Feedback): SafeHtml {
  return html`<article class="panel" aria-labelledby="message-title">
    <h2 class="panel__title" id="message-title">Message</h2>
    <div class="message">${feedback.message}</div>
    <div class="panel__actions">${reply(feedback)}</div>
  </article>`;
}

export function feedbackPage(input: FeedbackPageInput): string {
  const { feedback } = input;
  return layout({
    title: `#${feedback.id} ${feedback.title}`,
    signedIn: { csrfToken: input.csrfToken, section: "inbox" },
    main: html`${pageHeader({
      back: { href: ADMIN_UI.home, label: "Retours" },
      kicker: `01 / Retours / #${feedback.id}`,
      title: feedback.title,
      titleStyle: "content",
      meta: html`<span class="badges">${badge({ family: "kind", value: feedback.kind })}
        ${badge({ family: "status", value: feedback.status })}</span>
        <span>Reçu le ${formatDate(feedback.createdAt)}</span>`,
    })}
      ${notice(input.notice)}
      <div class="detail">
        <div class="stack">${messagePanel(feedback)}${contextPanel(input)}</div>
        ${feedbackActions(input)}
      </div>`,
  });
}
