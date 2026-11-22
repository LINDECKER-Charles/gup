import { html, type SafeHtml } from "./html.js";

interface Message {
  readonly text: string;
  /** An alert says the action did not happen; announced at once. */
  readonly isAlert?: boolean;
}

/** Confirmations shown after a redirect, keyed by the `ok` query parameter. */
const MESSAGES: Readonly<Record<string, Message>> = {
  status: { text: "Statut mis à jour." },
  note: { text: "Note enregistrée." },
  deleted: { text: "Retour supprimé." },
  erased: { text: "Installation et journaux effacés." },
  "test-sent": { text: "Mail de test envoyé : vérifiez la boîte du destinataire." },
  "test-failed": {
    text: "Le mail de test n’est pas parti. L’erreur du relais est affichée ci-dessous.",
    isAlert: true,
  },
  "test-unconfigured": {
    text: "Aucun relais SMTP n’est configuré : le mail de test ne peut pas partir.",
    isAlert: true,
  },
  "test-limited": {
    text: "Trop de mails de test en peu de temps. Réessayez dans quelques minutes.",
    isAlert: true,
  },
  retried: { text: "Les mails non envoyés repartent à la prochaine relève de la file." },
  "retry-none": { text: "Aucun mail en attente : rien à relancer." },
  "retry-unconfigured": {
    text: "Aucun relais SMTP n’est configuré : relancer ne ferait partir aucun mail.",
    isAlert: true,
  },
};

export function notice(code: string | null): SafeHtml {
  const message = code === null ? undefined : MESSAGES[code];
  if (message === undefined) return html``;
  if (message.isAlert === true) return html`<p class="alert" role="alert">${message.text}</p>`;
  return html`<p class="notice" role="status">${message.text}</p>`;
}
