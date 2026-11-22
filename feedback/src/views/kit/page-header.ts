import { html, type SafeHtml } from "./html.js";

export interface PageHeaderInput {
  /** Where the page sits, in the landing's `07 / FEEDBACK` manner. */
  readonly kicker: string;
  readonly title: string;
  /**
   * `display` for the back office's own page names (the brand face);
   * `content` for a title a reporter wrote, in the text face.
   */
  readonly titleStyle?: "display" | "content";
  readonly back?: { readonly href: string; readonly label: string };
  readonly meta?: SafeHtml;
}

/** The head of every page: an optional way back, the kicker, the title, a line of facts. */
export function pageHeader(input: PageHeaderInput): SafeHtml {
  const back = input.back === undefined
    ? ""
    : html`<a class="back" href="${input.back.href}"><span aria-hidden="true">←</span>
      ${input.back.label}</a>`;
  const titleClass = input.titleStyle === "content" ? "content-title" : "display";
  const meta = input.meta === undefined
    ? ""
    : html`<div class="page-head__meta">${input.meta}</div>`;
  return html`<header class="page-head">
    ${back}
    <p class="kicker">${input.kicker}</p>
    <h1 class="${titleClass}">${input.title}</h1>
    ${meta}
  </header>`;
}
