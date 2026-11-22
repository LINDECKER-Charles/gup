import type { McpAccess } from "../../../domain/mcp-access.js";
import { ADMIN_UI } from "../../admin-ui.js";
import { badge } from "../../kit/badge.js";
import { html, type SafeHtml } from "../../kit/html.js";
import { layout } from "../../kit/layout.js";
import { pageHeader } from "../../kit/page-header.js";
import { formatDate } from "../../text/format-date.js";
import type { ClaudeCodeSetup } from "./claude-code-setup.js";
import { connectSteps } from "./issue-panel.js";

export interface TokenPageInput {
  readonly csrfToken: string;
  readonly access: McpAccess;
  readonly token: string;
  readonly setup: ClaudeCodeSetup;
}

function revealPanel(input: TokenPageInput): SafeHtml {
  const permissions = input.access.permissions.map((value) =>
    html`<li>${badge({ family: "permission", value })}</li>`);
  return html`<section class="panel reveal" aria-labelledby="token-title">
    <div class="panel__part">
      <h2 class="panel__title" id="token-title">Jeton</h2>
      <p class="reveal__warning">Copiez-le maintenant : cette page ne s’affichera plus, et le
        service n’en garde que l’empreinte.</p>
      <p class="secret" id="token">${input.token}</p>
      <ul class="badges" aria-label="Permissions">${permissions}</ul>
    </div>
    <div class="panel__part">
      <h2 class="panel__title">Brancher Claude Code</h2>
      ${connectSteps(input.setup)}
    </div>
    <div class="panel__part">
      <a class="btn btn--primary btn--small" href="${ADMIN_UI.mcpPath}">J’ai copié le jeton</a>
    </div>
  </section>`;
}

/** The one time a token is shown: the access it opens, the token, what to do with it. */
export function tokenPage(input: TokenPageInput): string {
  const { access } = input;
  return layout({
    title: "Jeton MCP",
    signedIn: { csrfToken: input.csrfToken, section: "mcp" },
    main: html`${pageHeader({
      back: { href: ADMIN_UI.mcpPath, label: "Accès MCP" },
      kicker: "04 / MCP",
      title: "Accès émis",
      meta: html`<span>${access.name}</span>
        <span>expire le ${formatDate(access.expiresAt)}</span>`,
    })}
      ${revealPanel(input)}`,
  });
}
