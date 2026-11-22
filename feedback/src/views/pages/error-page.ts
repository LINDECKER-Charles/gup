import { ADMIN_UI } from "../admin-ui.js";
import { html } from "../kit/html.js";
import { layout, type LayoutInput } from "../kit/layout.js";

export interface ErrorPageInput {
  readonly title: string;
  readonly message: string;
  readonly signedIn?: LayoutInput["signedIn"];
}

export function errorPage(input: ErrorPageInput): string {
  return layout({
    title: input.title,
    ...(input.signedIn === undefined ? {} : { signedIn: input.signedIn }),
    main: html`<section class="card card--narrow">
      <h1 class="page__title">${input.title}</h1>
      <p>${input.message}</p>
      <p><a class="button button--quiet" href="${ADMIN_UI.home}">Retour aux retours</a></p>
    </section>`,
  });
}
