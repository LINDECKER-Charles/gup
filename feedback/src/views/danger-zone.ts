import { ADMIN_UI } from "./admin-ui.js";
import { csrfField } from "./csrf-field.js";
import { html, type SafeHtml } from "./kit/html.js";

export interface DangerZoneInput {
  readonly csrfToken: string;
  /** Where the form posts. */
  readonly action: string;
  /** Unique in the page: names the confirmation box. */
  readonly id: string;
  /** The folded line, an imperative: "Supprimer ce retour". */
  readonly summary: string;
  /** What goes and what stays, in one sentence. */
  readonly consequence: string;
  readonly confirmation: string;
  readonly button: string;
}

/**
 * An irreversible action, folded until asked for, and refused by the browser
 * until its box is ticked (the server checks the box too).
 */
export function dangerZone(input: DangerZoneInput): SafeHtml {
  const box = `confirm-${input.id}`;
  return html`<details class="danger">
    <summary>${input.summary}</summary>
    <form class="danger__body" method="post" action="${input.action}">
      ${csrfField(input.csrfToken)}
      <p>${input.consequence}</p>
      <label class="check" for="${box}">
        <input id="${box}" name="confirm" type="checkbox" value="${ADMIN_UI.confirmed}" required>
        <span>${input.confirmation}</span>
      </label>
      <button class="btn btn--danger btn--small" type="submit">${input.button}</button>
    </form>
  </details>`;
}
