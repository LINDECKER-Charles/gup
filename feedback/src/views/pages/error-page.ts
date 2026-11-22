import { ADMIN_UI } from "../admin-ui.js";
import { html } from "../kit/html.js";
import { layout, type LayoutInput } from "../kit/layout.js";
import { pageHeader } from "../kit/page-header.js";

export interface ErrorPageInput {
  readonly title: string;
  readonly message: string;
  readonly signedIn?: LayoutInput["signedIn"];
}

export function errorPage(input: ErrorPageInput): string {
  return layout({
    title: input.title,
    ...(input.signedIn === undefined ? {} : { signedIn: input.signedIn }),
    main: html`<div class="auth"><section class="panel auth__panel">
      ${pageHeader({ kicker: "Erreur", title: input.title })}
      <p>${input.message}</p>
      <a class="btn btn--ghost" href="${ADMIN_UI.home}">Retour aux retours</a>
    </section></div>`,
  });
}
