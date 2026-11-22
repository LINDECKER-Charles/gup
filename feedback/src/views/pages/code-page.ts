import { ADMIN_UI } from "../admin-ui.js";
import { csrfField } from "../csrf-field.js";
import { html } from "../kit/html.js";
import { layout } from "../kit/layout.js";
import { pageHeader } from "../kit/page-header.js";

export interface CodePageInput {
  /** The token of the session awaiting its code. */
  readonly csrfToken: string;
  readonly digits: number;
  /** Shown above the form: a wrong or expired code. */
  readonly error: string | null;
}

/** The second step of a login: the code of the authenticator app. */
export function codePage(input: CodePageInput): string {
  const error = input.error === null
    ? ""
    : html`<p class="alert" role="alert" id="code-error">${input.error}</p>`;
  const describedBy = input.error === null ? "code-hint" : "code-hint code-error";
  return layout({
    title: "Code de vérification",
    main: html`<div class="auth"><section class="panel auth__panel">
      ${pageHeader({ kicker: "Back office", title: "Code de vérification" })}
      <p class="muted">Mot de passe accepté. Il reste le code de l’application
        d’authentification.</p>
      ${error}
      <form class="form" method="post" action="${ADMIN_UI.codePath}">
        ${csrfField(input.csrfToken)}
        <div class="field">
          <label class="field-label" for="code">Code à ${input.digits} chiffres</label>
          <input class="field-control field-control--code" id="code" name="code" type="text"
            inputmode="numeric" autocomplete="one-time-code" spellcheck="false" required
            autofocus aria-describedby="${describedBy}">
          <p class="field-note" id="code-hint">Il change toutes les 30 secondes ; un code ne
            sert qu’une fois.</p>
        </div>
        <button class="btn btn--primary btn--block" type="submit">Vérifier</button>
      </form>
      <p class="field-note"><a href="${ADMIN_UI.loginPath}">Recommencer avec le mot de
        passe</a></p>
    </section></div>`,
  });
}
