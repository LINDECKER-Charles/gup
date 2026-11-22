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
  readonly to: string;
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

function configuration(input: RelayPanelInput): SafeHtml {
  const { relay } = input;
  if (relay === null) {
    return html`<div class="empty empty--inline">
      <p class="empty__title">Non configuré : les mails attendent dans la file.</p>
      <p class="empty__hint">Renseignez SMTP_URL, MAIL_FROM et FEEDBACK_NOTIFY_TO, puis
        redémarrez le service : la file part à la première relève.</p>
    </div>`;
  }
  const tls = relay.endpoint.isImplicitTls
    ? "Implicite (smtps)"
    : "STARTTLS si le serveur la propose";
  return html`<dl class="facts">
    ${fact("Serveur", html`<span class="mono">${relay.endpoint.host}</span>`, true)}
    ${fact("Port", port(relay.endpoint))}
    ${fact("TLS", tls)}
    ${fact("Expéditeur", relay.from, true)}
    ${fact("Destinataire", relay.to, true)}
    ${fact("Relève de la file", `toutes les ${formatDuration(input.pollIntervalMs)}`)}
    ${fact("Essais", `${input.maxAttempts} au plus`)}
  </dl>`;
}

function lastTest(outcome: MailTestOutcome | null): SafeHtml {
  if (outcome === null) return html``;
  const at = formatDate(outcome.at, "second");
  if (outcome.error === null) {
    return html`<p class="field-note">Dernier test : accepté par le relais le ${at},
      pour ${outcome.to}.</p>`;
  }
  return html`<div class="test-error"><p class="field-note">Dernier test : refusé le ${at}.
    </p><pre>${outcome.error}</pre></div>`;
}

function testForm(input: RelayPanelInput): SafeHtml {
  const minutes = input.testLimit.windowMs / DURATION_MS.minute;
  return html`<form class="panel__part" method="post" action="${ADMIN_UI.mailsPath}/test">
    ${csrfField(input.csrfToken)}
    <h2 class="panel__title">Vérifier le relais</h2>
    <button class="btn btn--primary btn--small" type="submit">Envoyer un mail de test</button>
    <p class="field-note">Un mail simple au destinataire, par le même relais que les
      notifications ; ${input.testLimit.max} par ${minutes} minutes au plus.</p>
    ${lastTest(input.lastTest)}
  </form>`;
}

function retryForm(input: RelayPanelInput): SafeHtml {
  return html`<form class="panel__part" method="post" action="${ADMIN_UI.mailsPath}/retry">
    ${csrfField(input.csrfToken)}
    <h2 class="panel__title">Relancer la file</h2>
    <button class="btn btn--ghost btn--small" type="submit">Relancer maintenant</button>
    <p class="field-note">Rend dus tout de suite les mails non envoyés : ils partent à la
      prochaine relève. Un mail abandonné a droit à un nouvel essai.</p>
  </form>`;
}

/** The relay's settings and the two levers on it. */
export function relayPanel(input: RelayPanelInput): SafeHtml {
  return html`<aside class="panel detail__side" aria-labelledby="relay-title">
    <div class="panel__part">
      <h2 class="panel__title" id="relay-title">Relais SMTP</h2>
      ${configuration(input)}
    </div>
    ${testForm(input)}
    ${retryForm(input)}
  </aside>`;
}
