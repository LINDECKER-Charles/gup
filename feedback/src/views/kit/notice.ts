import { html, type SafeHtml } from "./html.js";

/** Confirmations shown after a redirect, keyed by the `ok` query parameter. */
const MESSAGES: Readonly<Record<string, string>> = {
  status: "Statut mis à jour.",
  note: "Note enregistrée.",
  deleted: "Retour supprimé.",
  erased: "Installation et journaux effacés.",
};

export function notice(code: string | null): SafeHtml {
  const message = code === null ? undefined : MESSAGES[code];
  if (message === undefined) return html``;
  return html`<p class="notice" role="status">${message}</p>`;
}
