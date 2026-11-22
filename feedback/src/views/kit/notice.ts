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
  "test-invalid": {
    text: "Cette adresse n’est pas valide : le mail de test n’est pas parti.",
    isAlert: true,
  },
  "recipient-saved": { text: "Destinataire enregistré : les prochains retours lui sont notifiés." },
  "recipient-reset": { text: "Les retours sont de nouveau notifiés à FEEDBACK_NOTIFY_TO." },
  "recipient-invalid": {
    text: "Cette adresse n’est pas valide : le destinataire n’a pas changé.",
    isAlert: true,
  },
  "recipient-unconfigured": {
    text: "Aucun relais SMTP n’est configuré : aucun mail ne part, à aucune adresse.",
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
  "access-revoked": { text: "Accès révoqué : son jeton est refusé dès maintenant." },
  "access-inactive": {
    text: "Cet accès avait déjà expiré ou été révoqué : rien n’a changé.",
    isAlert: true,
  },
  "token-gone": {
    text: "Un jeton ne s’affiche qu’une fois, juste après l’émission. Perdu : révoquez "
      + "l’accès et émettez-en un autre.",
    isAlert: true,
  },
};

export function notice(code: string | null): SafeHtml {
  const message = code === null ? undefined : MESSAGES[code];
  if (message === undefined) return html``;
  if (message.isAlert === true) return html`<p class="alert" role="alert">${message.text}</p>`;
  return html`<p class="notice" role="status">${message.text}</p>`;
}
