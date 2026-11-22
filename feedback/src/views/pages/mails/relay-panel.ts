import { MAX_EMAIL_LENGTH } from "../../../domain/email-address.js";
import type { Recipient } from "../../../mail/notify-recipient.js";
import type { SmtpEndpoint } from "../../../mail/smtp-endpoint.js";
import { DURATION_MS } from "../../../time-units.js";
import { ADMIN_UI } from "../../admin-ui.js";
import { csrfField } from "../../csrf-field.js";
import { html, type SafeHtml } from "../../kit/html.js";
import { formatDate } from "../../text/format-date.js";
import { formatDuration } from "../../text/format-duration.js";

/** The relay as configured: never the user name or password of `SMTP_URL`. */
export interface RelayView {
  readonly endpoint: SmtpEndpoint;
  readonly from: string;
  /** Where notifications go now. */
  readonly recipient: Recipient;
  /** FEEDBACK_NOTIFY_TO: what going back to the default restores. */
  readonly configuredTo: string;
}

/** The last test mail this process sent, kept in memory until a restart. */
export interface MailTestOutcome {
  readonly at: Date;
  readonly to: string;
  /** null = the relay accepted it. */
  readonly error: string | null;
}

export interface RelayPanelInput {
  readonly csrfToken: string;
  /** null = SMTP is not configured. */
  readonly relay: RelayView | null;
  readonly pollIntervalMs: number;
  readonly maxAttempts: number;
  readonly lastTest: MailTestOutcome | null;
  readonly testLimit: { readonly max: number; readonly windowMs: number };
}

function fact(term: string, value: SafeHtml | string, isWide = false): SafeHtml {
  const wide = isWide ? " facts__item--wide" : "";
  return html`<div class="facts__item${wide}"><dt>${term}</dt><dd>${value}</dd></div>`;
}

function port(endpoint: SmtpEndpoint): string {
  return endpoint.isDefaultPort ? `${endpoint.port} (par défaut)` : String(endpoint.port);
}

function recipientFact(relay: RelayView): SafeHtml {
  const { address, changedAt } = relay.recipient;
  const source = changedAt === null
    ? "FEEDBACK_NOTIFY_TO, par défaut"
    : `choisi ici le ${formatDate(changedAt)}, au lieu de ${relay.configuredTo}`;
  return fact("Destinataire des retours", html`${address}
    <span class="facts__note">${source}</span>`, true);
}

function configuration(input: RelayPanelInput, relay: RelayView): SafeHtml {
  const tls = relay.endpoint.isImplicitTls
    ? "Implicite (smtps)"
    : "STARTTLS si le serveur la propose";
  return html`<dl class="facts">
    ${fact("Serveur", html`<span class="mono">${relay.endpoint.host}</span>`, true)}
    ${fact("Port", port(relay.endpoint))}
    ${fact("TLS", tls)}
    ${fact("Expéditeur", relay.from, true)}
    ${recipientFact(relay)}
    ${fact("Relève de la file", `toutes les ${formatDuration(input.pollIntervalMs)}`)}
    ${fact("Essais", `${input.maxAttempts} au plus`)}
  </dl>`;
}

const UNCONFIGURED = html`<div class="empty empty--inline">
  <p class="empty__title">Non configuré : les mails attendent dans la file.</p>
  <p class="empty__hint">Renseignez SMTP_URL, MAIL_FROM et FEEDBACK_NOTIFY_TO, puis
    redémarrez le service : la file part à la première relève.</p>
</div>`;

interface AddressField {
  readonly id: string;
  readonly label: SafeHtml;
  readonly value: string;
  readonly hint: SafeHtml;
}

/** One address field; `type="email"` and the length bound only spare a round trip. */
function addressField(field: AddressField): SafeHtml {
  const { id } = field;
  return html`<div class="field">
    ${field.label}
    <input class="field-control" id="${id}" name="to" type="email" required
      maxlength="${MAX_EMAIL_LENGTH}" autocomplete="email" spellcheck="false"
      value="${field.value}" aria-describedby="${id}-hint">
    <p class="field-note" id="${id}-hint">${field.hint}</p>
  </div>`;
}

function recipientForm(input: RelayPanelInput, relay: RelayView): SafeHtml {
  const isChanged = relay.recipient.changedAt !== null;
  const reset = isChanged
    ? html`<button class="btn btn--ghost btn--small" type="submit" formnovalidate
        formaction="${ADMIN_UI.mailsPath}/recipient/reset">Revenir à ${relay.configuredTo}</button>`
    : html``;
  const hint = html`Chaque nouveau retour y est notifié, y compris ceux encore dans la file.
    Par défaut : ${relay.configuredTo} (FEEDBACK_NOTIFY_TO).`;
  return html`<form class="panel__part form" method="post"
      action="${ADMIN_UI.mailsPath}/recipient">
    ${csrfField(input.csrfToken)}
    ${addressField({
      id: "recipient", value: relay.recipient.address, hint,
      label: html`<label class="panel__title" for="recipient">Destinataire des retours</label>`,
    })}
    <div class="form__actions">
      <button class="btn btn--primary btn--small" type="submit">Enregistrer</button>
      ${reset}
    </div>
  </form>`;
}

function lastTest(outcome: MailTestOutcome | null): SafeHtml {
  if (outcome === null) return html``;
  const at = formatDate(outcome.at, "second");
  if (outcome.error === null) {
    return html`<p class="field-note">Dernier test : accepté par le relais le ${at},
      pour ${outcome.to}.</p>`;
  }
  return html`<div class="test-error"><p class="field-note">Dernier test : refusé le ${at},
    pour ${outcome.to}.</p><pre>${outcome.error}</pre></div>`;
}

function testForm(input: RelayPanelInput, relay: RelayView): SafeHtml {
  const minutes = input.testLimit.windowMs / DURATION_MS.minute;
  const hint = html`Un mail simple, par le même relais et du même expéditeur que les
    notifications ; ${input.testLimit.max} par ${minutes} minutes au plus.`;
  return html`<form class="panel__part form" method="post" action="${ADMIN_UI.mailsPath}/test">
    ${csrfField(input.csrfToken)}
    <h2 class="panel__title">Vérifier le relais</h2>
    ${addressField({
      id: "test-to", value: relay.recipient.address, hint,
      label: html`<label class="field-label" for="test-to">Envoyer à</label>`,
    })}
    <div class="form__actions">
      <button class="btn btn--ghost btn--small" type="submit">Envoyer un mail de test</button>
    </div>
    ${lastTest(input.lastTest)}
  </form>`;
}

function retryForm(input: RelayPanelInput): SafeHtml {
  return html`<form class="panel__part form" method="post" action="${ADMIN_UI.mailsPath}/retry">
    ${csrfField(input.csrfToken)}
    <h2 class="panel__title">Relancer la file</h2>
    <div class="form__actions">
      <button class="btn btn--ghost btn--small" type="submit">Relancer maintenant</button>
    </div>
    <p class="field-note">Rend dus tout de suite les mails non envoyés : ils partent à la
      prochaine relève. Un mail abandonné a droit à un nouvel essai.</p>
  </form>`;
}

/** The relay's settings and the levers on it; without SMTP, only what to configure. */
export function relayPanel(input: RelayPanelInput): SafeHtml {
  const { relay } = input;
  const body = relay === null
    ? html`${UNCONFIGURED}`
    : html`${configuration(input, relay)}`;
  const levers = relay === null
    ? html``
    : html`${recipientForm(input, relay)}${testForm(input, relay)}${retryForm(input)}`;
  return html`<aside class="panel detail__side" aria-labelledby="relay-title">
    <div class="panel__part">
      <h2 class="panel__title" id="relay-title">Relais SMTP</h2>
      ${body}
    </div>
    ${levers}
  </aside>`;
}
