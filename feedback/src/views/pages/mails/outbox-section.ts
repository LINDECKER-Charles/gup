import type { OutboxCounts, UnsentMail } from "../../../ports/mail/outbox-monitor.js";
import type { Page } from "../../../ports/page.js";
import { ADMIN_UI } from "../../admin-ui.js";
import { badge } from "../../kit/badge.js";
import { emptyState } from "../../kit/empty-state.js";
import { href } from "../../kit/href.js";
import { html, type SafeHtml } from "../../kit/html.js";
import { pagination } from "../../kit/pagination.js";
import { formatDate } from "../../text/format-date.js";

export interface OutboxSectionInput {
  readonly counts: OutboxCounts;
  readonly unsent: Page<UnsentMail>;
  readonly maxAttempts: number;
  /** How far back "sent recently" looks, in days. */
  readonly sentWindowDays: number;
}

/** A table cell shows the start of an SMTP error; the outbox keeps up to 1000 characters. */
const ERROR_EXCERPT_LENGTH = 240;
const NUMBER = new Intl.NumberFormat("fr-FR");

function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > ERROR_EXCERPT_LENGTH ? `${flat.slice(0, ERROR_EXCERPT_LENGTH)}…` : flat;
}

function stat(label: string, value: number, tone = ""): SafeHtml {
  const toned = tone === "" ? "" : ` stat--${tone}`;
  return html`<div class="stat${toned}"><dt class="stat__label">${label}</dt>
    <dd class="stat__value">${NUMBER.format(value)}</dd></div>`;
}

function stats(input: OutboxSectionInput): SafeHtml {
  const { counts } = input;
  return html`<dl class="stats" aria-label="État de la file">
    ${stat("En attente", counts.waiting, counts.waiting > 0 ? "waiting" : "")}
    ${stat("En échec", counts.failing, counts.failing > 0 ? "failing" : "")}
    ${stat(`Envoyés (${input.sentWindowDays} j)`, counts.sentRecently)}
  </dl>`;
}

function nextAttempt(mail: UnsentMail, maxAttempts: number): SafeHtml | string {
  if (mail.attempts >= maxAttempts) return html`<span class="muted">abandonné</span>`;
  return formatDate(mail.nextAttemptAt, "second");
}

/** Each cell holds one element or plain text: below 720 px, a row stacks into a card. */
function mailRow(mail: UnsentMail, maxAttempts: number): SafeHtml {
  const error = mail.lastError === null
    ? html`<span class="muted">aucune</span>`
    : excerpt(mail.lastError);
  return html`<tr>
    <th scope="row" data-label="Retour"><span class="cell-stack">
      <a href="${ADMIN_UI.home}/feedback/${mail.feedbackId}">#${mail.feedbackId}
        ${mail.feedbackTitle}</a>${badge({ family: "kind", value: mail.feedbackKind })}</span></th>
    <td class="nowrap" data-label="En file depuis">${formatDate(mail.createdAt)}</td>
    <td class="num" data-label="Tentatives">${mail.attempts} / ${maxAttempts}</td>
    <td class="nowrap" data-label="Prochain essai">${nextAttempt(mail, maxAttempts)}</td>
    <td class="wrap mono" data-label="Dernière erreur">${error}</td>
  </tr>`;
}

function table(input: OutboxSectionInput): SafeHtml {
  if (input.unsent.items.length === 0) {
    return emptyState({
      title: "Aucun mail en attente.",
      hint: "Chaque nouveau retour met sa notification dans la file ; elle part à la relève.",
    });
  }
  return html`<div class="table-wrap"><table class="table table--stack">
    <caption class="sr-only">Mails non envoyés, du plus ancien au plus récent</caption>
    <thead><tr><th scope="col">Retour</th><th scope="col">En file depuis</th>
      <th scope="col" class="num">Tentatives</th><th scope="col">Prochain essai</th>
      <th scope="col">Dernière erreur</th></tr></thead>
    <tbody>${input.unsent.items.map((mail) => mailRow(mail, input.maxAttempts))}</tbody>
  </table></div>`;
}

/** The outbox: its counts, then every mail not sent yet, oldest first. */
export function outboxSection(input: OutboxSectionInput): SafeHtml {
  return html`<section class="stack" aria-labelledby="outbox-title">
    <h2 class="section__title" id="outbox-title">File d’envoi</h2>
    ${stats(input)}
    ${table(input)}
    ${pagination({
      page: input.unsent,
      hrefFor: (page) => href(ADMIN_UI.mailsPath, { page }),
      label: "Pages de la file",
    })}
  </section>`;
}
