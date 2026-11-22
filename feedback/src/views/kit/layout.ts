import { assetHref } from "../admin-assets.js";
import { ADMIN_UI } from "../admin-ui.js";
import { csrfField } from "../csrf-field.js";
import { html, type SafeHtml } from "./html.js";

export type AdminSection = "inbox" | "installs";

export interface LayoutInput {
  readonly title: string;
  readonly main: SafeHtml;
  /** Absent on the login and error pages of a signed-out visitor: no navigation. */
  readonly signedIn?: { readonly csrfToken: string; readonly section: AdminSection | null };
}

/** The landing's background colour, for the browser's own chrome. */
const THEME_COLOR = "#0b0c10";

const SECTIONS: readonly { section: AdminSection; href: string; index: string; label: string }[] = [
  { section: "inbox", href: ADMIN_UI.home, index: "01", label: "Retours" },
  { section: "installs", href: `${ADMIN_UI.home}/installs`, index: "02", label: "Installations" },
];

function brand(): SafeHtml {
  return html`<a class="brand" href="${ADMIN_UI.home}">
    <img class="brand__mark" src="${assetHref("logo-64.png")}" width="30" height="30" alt="">
    <span class="brand__word">GUP</span>
    <span class="brand__tag">Retours</span>
  </a>`;
}

function nav(current: AdminSection | null): SafeHtml {
  const links = SECTIONS.map((item) => {
    const mark = item.section === current ? html` aria-current="page"` : "";
    return html`<a class="nav__link" href="${item.href}"${mark}>
      <span class="nav__index" aria-hidden="true">${item.index}</span>${item.label}</a>`;
  });
  return html`<nav class="nav" aria-label="Sections">${links}</nav>`;
}

function header(signedIn: LayoutInput["signedIn"]): SafeHtml {
  const actions = signedIn === undefined
    ? ""
    : html`${nav(signedIn.section)}
      <form class="logout" method="post" action="${ADMIN_UI.home}/logout">
        ${csrfField(signedIn.csrfToken)}
        <button class="btn btn--ghost btn--small" type="submit">Se déconnecter</button>
      </form>`;
  return html`<header class="topbar"><div class="shell topbar__inner">${brand()}${actions}</div>
  </header>`;
}

function head(title: string): SafeHtml {
  return html`<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="${THEME_COLOR}">
<meta name="robots" content="noindex, nofollow">
<title>${title} · gup retours</title>
<link rel="icon" href="${assetHref("favicon.ico")}" sizes="48x48">
<link rel="icon" href="${assetHref("favicon-96.png")}" type="image/png" sizes="96x96">
<link rel="apple-touch-icon" href="${assetHref("apple-touch-icon.png")}">
<link rel="stylesheet" href="${assetHref("app.css")}">`;
}

/** The document shell shared by every back-office page. */
export function layout(input: LayoutInput): string {
  return html`<!doctype html>
<html lang="fr">
<head>
${head(input.title)}
</head>
<body>
<a class="skip-link" href="#contenu">Aller au contenu</a>
${header(input.signedIn)}
<main id="contenu" class="shell page" tabindex="-1">
${input.main}
</main>
</body>
</html>`.value;
}
