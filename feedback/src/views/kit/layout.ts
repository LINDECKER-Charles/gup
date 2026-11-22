import { ADMIN_UI } from "../admin-ui.js";
import { csrfField } from "../csrf-field.js";
import { html, type SafeHtml } from "./html.js";
import { STYLESHEET } from "./stylesheet.js";

export type AdminSection = "inbox" | "installs";

export interface LayoutInput {
  readonly title: string;
  readonly main: SafeHtml;
  /** Absent on the login and error pages of a signed-out visitor: no navigation. */
  readonly signedIn?: { readonly csrfToken: string; readonly section: AdminSection | null };
}

const CURRENT_PAGE_ATTRIBUTE = html` aria-current="page"`;

function navLink(href: string, label: string, isCurrent: boolean): SafeHtml {
  const current = isCurrent ? CURRENT_PAGE_ATTRIBUTE : "";
  return html`<a class="nav__link" href="${href}"${current}>${label}</a>`;
}

function header(signedIn: LayoutInput["signedIn"]): SafeHtml {
  const brand = html`<a class="brand" href="${ADMIN_UI.home}">gup <span>retours</span></a>`;
  if (signedIn === undefined) return html`<header class="topbar">${brand}</header>`;
  return html`<header class="topbar">
    ${brand}
    <nav class="nav" aria-label="Navigation principale">
      ${navLink(ADMIN_UI.home, "Retours", signedIn.section === "inbox")}
      ${navLink("/admin/installs", "Installations", signedIn.section === "installs")}
    </nav>
    <form class="logout" method="post" action="/admin/logout">
      ${csrfField(signedIn.csrfToken)}
      <button class="button button--quiet" type="submit">Se déconnecter</button>
    </form>
  </header>`;
}

/** The document shell shared by every back-office page. */
export function layout(input: LayoutInput): string {
  return html`<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="robots" content="noindex, nofollow">
<title>${input.title} · gup retours</title>
<link rel="stylesheet" href="${STYLESHEET.href}">
</head>
<body>
<a class="skip-link" href="#contenu">Aller au contenu</a>
${header(input.signedIn)}
<main id="contenu" class="page">
${input.main}
</main>
</body>
</html>`.value;
}
