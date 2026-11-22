import {
  FEEDBACK_VOCABULARY, type Feedback, type FeedbackKind, type FeedbackStatus, type StatusCounts,
} from "../../domain/feedback.js";
import type { Page } from "../../ports/page.js";
import { ADMIN_UI } from "../admin-ui.js";
import { badge } from "../kit/badge.js";
import { emptyState } from "../kit/empty-state.js";
import { formatDate } from "../kit/format-date.js";
import { href } from "../kit/href.js";
import { html, type SafeHtml } from "../kit/html.js";
import { LABELS } from "../kit/labels.js";
import { layout } from "../kit/layout.js";
import { notice } from "../kit/notice.js";
import { pagination } from "../kit/pagination.js";

const EXCERPT_LENGTH = 160;
const ALL = "all";

export interface InboxPageInput {
  readonly csrfToken: string;
  readonly counts: StatusCounts;
  /** null = every status. */
  readonly status: FeedbackStatus | null;
  readonly kind: FeedbackKind | null;
  readonly page: Page<Feedback>;
  readonly notice: string | null;
}

interface Filters {
  readonly status: FeedbackStatus | null;
  readonly kind: FeedbackKind | null;
}

function inboxHref(filters: Filters, page = 1): string {
  return href(ADMIN_UI.home, { status: filters.status ?? ALL, kind: filters.kind, page });
}

function current(isCurrent: boolean): SafeHtml {
  return isCurrent ? html` aria-current="page"` : html``;
}

function statusTabs(input: InboxPageInput): SafeHtml {
  const total = FEEDBACK_VOCABULARY.statuses.reduce((sum, status) => sum + input.counts[status], 0);
  const tabs = [...FEEDBACK_VOCABULARY.statuses, null].map((status) => {
    const label = status === null ? "Tous" : LABELS.statusTab[status];
    const count = status === null ? total : input.counts[status];
    const link = inboxHref({ status, kind: input.kind });
    return html`<a class="tabs__tab" href="${link}"${current(status === input.status)}>
      ${label} <span class="tabs__count">${count}</span></a>`;
  });
  return html`<nav class="tabs" aria-label="Filtrer par statut">${tabs}</nav>`;
}

function kindFilter(input: InboxPageInput): SafeHtml {
  const kinds: readonly (FeedbackKind | null)[] = [null, "bug", "suggestion"];
  const links = kinds.map((kind) => {
    const label = kind === null ? "Tous les types" : `${LABELS.kind[kind]}s`;
    const link = inboxHref({ status: input.status, kind });
    return html`<a class="chip" href="${link}"${current(kind === input.kind)}>${label}</a>`;
  });
  return html`<nav class="chips" aria-label="Filtrer par type">${links}</nav>`;
}

function excerpt(message: string): string {
  const flat = message.replace(/\s+/g, " ");
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH)}…` : flat;
}

function feedbackRow(feedback: Feedback): SafeHtml {
  return html`<li class="row">
    <a class="row__link" href="/admin/feedback/${feedback.id}">
      <span class="row__head">
        <span class="row__title">${feedback.title}</span>
        <span class="row__badges">${badge({ family: "kind", value: feedback.kind })}
          ${badge({ family: "status", value: feedback.status })}</span>
      </span>
      <span class="row__excerpt">${excerpt(feedback.message)}</span>
      <span class="row__meta">#${feedback.id} · ${formatDate(feedback.createdAt)}
        ${feedback.email === null ? "" : " · adresse fournie"}</span>
    </a>
  </li>`;
}

function listOrEmpty(input: InboxPageInput): SafeHtml {
  if (input.page.items.length > 0) {
    return html`<ol class="rows">${input.page.items.map(feedbackRow)}</ol>`;
  }
  const hasAny = FEEDBACK_VOCABULARY.statuses.some((status) => input.counts[status] > 0);
  return hasAny || input.kind !== null
    ? emptyState("Aucun retour dans cette catégorie.", "Essayez un autre statut ou un autre type.")
    : emptyState(
      "Aucun retour pour le moment.",
      "Les retours envoyés depuis le site s’afficheront ici.",
    );
}

export function inboxPage(input: InboxPageInput): string {
  const filters: Filters = { status: input.status, kind: input.kind };
  return layout({
    title: "Retours",
    signedIn: { csrfToken: input.csrfToken, section: "inbox" },
    main: html`<h1 class="page__title">Retours</h1>
      ${notice(input.notice)}
      ${statusTabs(input)}
      ${kindFilter(input)}
      ${listOrEmpty(input)}
      ${pagination({
        page: input.page,
        hrefFor: (page) => inboxHref(filters, page),
        label: "Pages de retours",
      })}`,
  });
}
