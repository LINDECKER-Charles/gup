import type { Feedback, StatusCounts } from "../../../domain/feedback.js";
import type { Page } from "../../../ports/page.js";
import { emptyState } from "../../kit/empty-state.js";
import { feedbackCard } from "../../kit/feedback-card.js";
import { html, type SafeHtml } from "../../kit/html.js";
import { layout } from "../../kit/layout.js";
import { notice } from "../../kit/notice.js";
import { pageHeader } from "../../kit/page-header.js";
import { pagination } from "../../kit/pagination.js";
import { countOf } from "../../text/count-of.js";
import { LABELS } from "../../text/labels.js";
import { inboxToolbar } from "./inbox-filters.js";
import { inboxHref, type InboxFilters } from "./inbox-href.js";

export interface InboxPageInput extends InboxFilters {
  readonly csrfToken: string;
  readonly counts: StatusCounts;
  readonly page: Page<Feedback>;
  readonly notice: string | null;
}

const FEEDBACK_NOUN = { one: "retour", many: "retours" };
const FOUND_NOUN = { one: "retour trouvé", many: "retours trouvés" };
const NO_FILTER: InboxFilters = { status: null, kind: null, search: null };

/** Says what the search found and how to leave it; nothing without a search. */
function results(input: InboxPageInput): SafeHtml {
  if (input.search === null) return html``;
  return html`<p class="results">
    <span>${countOf(input.page.total, FOUND_NOUN)} pour « ${input.search} »</span>
    <a href="${inboxHref({ ...input, search: null })}">Effacer la recherche</a>
  </p>`;
}

/** "Nothing yet", "nothing new" and "nothing matches" are three different states. */
function empty(input: InboxPageInput): SafeHtml {
  const isUnfiltered = input.search === null && input.kind === null;
  if (isUnfiltered && input.status === null) {
    return emptyState({
      title: "Aucun retour pour le moment.",
      hint: "Les retours envoyés depuis le site s’afficheront ici.",
    });
  }
  if (isUnfiltered && input.status === "new") {
    return emptyState({
      title: "Aucun nouveau retour.",
      hint: "Tout ce qui est arrivé a été pris en compte.",
      action: { href: inboxHref(NO_FILTER), label: "Voir tous les retours" },
    });
  }
  return emptyState({
    title: "Aucun retour ne correspond.",
    hint: "Essayez un autre statut, un autre type ou une autre recherche.",
    action: { href: inboxHref(NO_FILTER), label: "Effacer la recherche et les filtres" },
  });
}

function list(input: InboxPageInput): SafeHtml {
  if (input.page.items.length === 0) return empty(input);
  return html`<ol class="rows">${input.page.items.map(feedbackCard)}</ol>
    ${pagination({
      page: input.page,
      hrefFor: (page) => inboxHref(input, page),
      label: "Pages de retours",
    })}`;
}

export function inboxPage(input: InboxPageInput): string {
  const title = input.status === null ? "Tous les retours" : LABELS.inboxTitle[input.status];
  return layout({
    title,
    signedIn: { csrfToken: input.csrfToken, section: "inbox" },
    main: html`${pageHeader({
      kicker: "01 / Retours",
      title,
      meta: html`<span>${countOf(input.page.total, FEEDBACK_NOUN)}</span>`,
    })}
      ${notice(input.notice)}
      ${inboxToolbar(input, input.counts)}
      ${results(input)}
      ${list(input)}`,
  });
}
