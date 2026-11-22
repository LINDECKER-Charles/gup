import { ADMIN_UI } from "../admin-ui.js";
import { html } from "../kit/html.js";
import { layout } from "../kit/layout.js";

export interface LoginPageInput {
  /** Shown above the form: wrong credentials, too many attempts. */
  readonly error: string | null;
  readonly username: string;
}

export function loginPage(input: LoginPageInput): string {
  const error = input.error === null
    ? ""
    : html`<p class="alert" role="alert" id="login-error">${input.error}</p>`;
  const describedBy = input.error === null ? "" : html` aria-describedby="login-error"`;
  return layout({
    title: "Connexion",
    main: html`<section class="card card--narrow">
      <h1 class="page__title">Connexion</h1>
      <p class="muted">Accès réservé au mainteneur de gup.</p>
      ${error}
      <form class="form" method="post" action="${ADMIN_UI.loginPath}"${describedBy}>
        <div class="field">
          <label for="username">Identifiant</label>
          <input id="username" name="username" type="text" autocomplete="username"
            autocapitalize="none" spellcheck="false" required value="${input.username}">
        </div>
        <div class="field">
          <label for="password">Mot de passe</label>
          <input id="password" name="password" type="password"
            autocomplete="current-password" required>
        </div>
        <button class="button button--primary" type="submit">Se connecter</button>
      </form>
    </section>`,
  });
}
