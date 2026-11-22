import type { InstallSummary } from "../../ports/install-reader.js";
import type { Page } from "../../ports/page.js";
import { emptyState } from "../kit/empty-state.js";
import { formatDate } from "../kit/format-date.js";
import { href } from "../kit/href.js";
import { html, type SafeHtml } from "../kit/html.js";
import { LABELS } from "../kit/labels.js";
import { layout } from "../kit/layout.js";
import { notice } from "../kit/notice.js";
import { pagination } from "../kit/pagination.js";

/** The first block of a UUID is enough to tell installs apart at a glance. */
const SHORT_ID_LENGTH = 8;

export interface InstallsPageInput {
  readonly csrfToken: string;
  readonly page: Page<InstallSummary>;
  readonly notice: string | null;
}

function installRow(install: InstallSummary): SafeHtml {
  const platform = install.platform === null ? "—" : LABELS.platform[install.platform];
  return html`<tr>
    <th scope="row"><a class="mono" href="/admin/installs/${install.id}"
      title="${install.id}">${install.id.slice(0, SHORT_ID_LENGTH)}…</a></th>
    <td>${formatDate(install.lastSeenAt)}</td>
    <td>${install.gupVersion ?? "—"}</td>
    <td>${platform ?? install.platform}</td>
    <td class="num">${install.historyCount}</td>
    <td class="num">${install.logCount}</td>
    <td class="num">${install.feedbackCount}</td>
  </tr>`;
}

function table(page: Page<InstallSummary>): SafeHtml {
  if (page.items.length === 0) {
    return emptyState(
      "Aucune installation n’a partagé ses journaux.",
      "Elles apparaissent ici au premier envoi accepté par l’utilisateur.",
    );
  }
  return html`<div class="table-wrap"><table class="table">
    <caption class="visually-hidden">Installations ayant partagé leurs journaux</caption>
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
    main: html`<h1 class="page__title">Installations</h1>
      ${notice(input.notice)}
      ${table(input.page)}
      ${pagination({
        page: input.page,
        hrefFor: (page) => href("/admin/installs", { page }),
        label: "Pages d’installations",
      })}`,
  });
}
