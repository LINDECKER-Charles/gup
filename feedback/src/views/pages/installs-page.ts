import type { InstallSummary } from "../../ports/install-reader.js";
import type { Page } from "../../ports/page.js";
import { ADMIN_UI } from "../admin-ui.js";
import { emptyState } from "../kit/empty-state.js";
import { href } from "../kit/href.js";
import { html, type SafeHtml } from "../kit/html.js";
import { layout } from "../kit/layout.js";
import { notice } from "../kit/notice.js";
import { pageHeader } from "../kit/page-header.js";
import { pagination } from "../kit/pagination.js";
import { countOf } from "../text/count-of.js";
import { formatDate } from "../text/format-date.js";
import { LABELS } from "../text/labels.js";

/** The first block of a UUID is enough to tell installs apart at a glance. */
const SHORT_ID_LENGTH = 8;
const INSTALLS_PATH = `${ADMIN_UI.home}/installs`;
const INSTALL_NOUN = { one: "installation", many: "installations" };

export interface InstallsPageInput {
  readonly csrfToken: string;
  readonly page: Page<InstallSummary>;
  readonly notice: string | null;
}

/** Each cell holds one element or plain text: below 720 px, a row stacks into a card. */
function installRow(install: InstallSummary): SafeHtml {
  const platform = install.platform === null ? "—" : LABELS.platform[install.platform];
  return html`<tr>
    <th scope="row" data-label="Installation"><a class="mono" href="${INSTALLS_PATH}/${install.id}"
      aria-label="Installation ${install.id}">${install.id.slice(0, SHORT_ID_LENGTH)}…</a></th>
    <td data-label="Dernier envoi">${formatDate(install.lastSeenAt)}</td>
    <td data-label="Version">${install.gupVersion ?? "—"}</td>
    <td data-label="Plateforme">${platform ?? install.platform}</td>
    <td class="num" data-label="Historique">${install.historyCount}</td>
    <td class="num" data-label="Journal">${install.logCount}</td>
    <td class="num" data-label="Retours">${install.feedbackCount}</td>
  </tr>`;
}

function table(page: Page<InstallSummary>): SafeHtml {
  if (page.items.length === 0) {
    return emptyState({
      title: "Aucune installation n’a partagé ses journaux.",
      hint: "Elles apparaissent ici au premier envoi accepté par l’utilisateur.",
    });
  }
  return html`<div class="table-wrap"><table class="table table--stack">
    <caption class="sr-only">Installations ayant partagé leurs journaux</caption>
    <thead><tr>
      <th scope="col">Installation</th><th scope="col">Dernier envoi</th>
      <th scope="col">Version</th><th scope="col">Plateforme</th>
      <th scope="col" class="num">Historique</th><th scope="col" class="num">Journal</th>
      <th scope="col" class="num">Retours</th>
    </tr></thead>
    <tbody>${page.items.map(installRow)}</tbody>
  </table></div>`;
}

export function installsPage(input: InstallsPageInput): string {
  return layout({
    title: "Installations",
    signedIn: { csrfToken: input.csrfToken, section: "installs" },
    main: html`${pageHeader({
      kicker: "02 / Installations",
      title: "Journaux partagés",
      meta: html`<span>${countOf(input.page.total, INSTALL_NOUN)}</span>`,
    })}
      ${notice(input.notice)}
      ${table(input.page)}
      ${pagination({
        page: input.page,
        hrefFor: (page) => href(INSTALLS_PATH, { page }),
        label: "Pages d’installations",
      })}`,
  });
}
