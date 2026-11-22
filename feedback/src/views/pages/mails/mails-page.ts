import { html } from "../../kit/html.js";
import { layout } from "../../kit/layout.js";
import { notice } from "../../kit/notice.js";
import { pageHeader } from "../../kit/page-header.js";
import { outboxSection, type OutboxSectionInput } from "./outbox-section.js";
import { relayPanel, type RelayPanelInput } from "./relay-panel.js";

export interface MailsPageInput extends RelayPanelInput, OutboxSectionInput {
  readonly notice: string | null;
}

/** The mail relay: what the service reads of its configuration, its outbox, its levers. */
export function mailsPage(input: MailsPageInput): string {
  const state = input.relay === null ? "Relais non configuré" : "Relais configuré";
  return layout({
    title: "Mails",
    signedIn: { csrfToken: input.csrfToken, section: "mails" },
    main: html`${pageHeader({
      kicker: "03 / Mails",
      title: "Relais des mails",
      meta: html`<span>${state}</span>`,
    })}
      ${notice(input.notice)}
      <div class="detail">
        ${outboxSection(input)}
        ${relayPanel(input)}
      </div>`,
  });
}
