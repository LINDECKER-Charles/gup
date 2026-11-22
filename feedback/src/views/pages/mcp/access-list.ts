import {
  MCP_ACCESS_RULES, mcpAccessState, type McpAccess, type McpAccessState,
} from "../../../domain/mcp-access.js";
import { MCP_TOKEN } from "../../../security/mcp-token.js";
import { DURATION_MS } from "../../../time-units.js";
import { ADMIN_UI } from "../../admin-ui.js";
import { dangerZone } from "../../danger-zone.js";
import { badge } from "../../kit/badge.js";
import { emptyState } from "../../kit/empty-state.js";
import { html, type SafeHtml } from "../../kit/html.js";
import { countOf } from "../../text/count-of.js";
import { formatDate } from "../../text/format-date.js";

export interface AccessListInput {
  readonly csrfToken: string;
  /** Newest first. */
  readonly accesses: readonly McpAccess[];
  readonly now: Date;
}

const DAYS = { one: "jour", many: "jours" } as const;

function fact(term: string, value: SafeHtml | string, note = ""): SafeHtml {
  const aside = note === "" ? "" : html`<span class="facts__note">${note}</span>`;
  return html`<div class="facts__item"><dt>${term}</dt><dd>${value}${aside}</dd></div>`;
}

function remaining(expiresAt: Date, now: Date): string {
  const days = Math.floor((expiresAt.getTime() - now.getTime()) / DURATION_MS.day);
  return days < 1 ? "dans moins d’un jour" : `dans ${countOf(days, DAYS)}`;
}

/** When it stops, or stopped, working. */
function endFact(access: McpAccess, state: McpAccessState, now: Date): SafeHtml {
  if (access.revokedAt !== null) return fact("Révoqué le", formatDate(access.revokedAt));
  if (state === "expired") return fact("Expiré le", formatDate(access.expiresAt));
  return fact("Expire le", formatDate(access.expiresAt), remaining(access.expiresAt, now));
}

function revokeZone(access: McpAccess, csrfToken: string): SafeHtml {
  return dangerZone({
    csrfToken,
    action: `${ADMIN_UI.mcpPath}/${access.id}/revoke`,
    id: access.id,
    summary: "Révoquer cet accès",
    consequence: "Son jeton est refusé dès la prochaine requête ; l’accès reste listé, "
      + `révoqué, ${MCP_ACCESS_RULES.historyDays} jours.`,
    confirmation: `Je révoque « ${access.name} » : il faudra émettre un autre accès.`,
    button: "Révoquer",
  });
}

function accessCard(access: McpAccess, input: AccessListInput): SafeHtml {
  const state = mcpAccessState(access, input.now);
  const permissions = access.permissions.map((value) =>
    html`<li>${badge({ family: "permission", value })}</li>`);
  const lastUsed = access.lastUsedAt === null
    ? html`<span class="muted">jamais</span>`
    : formatDate(access.lastUsedAt);
  return html`<li class="access access--${state}">
    <div class="access__head">
      <h3 class="access__name">${access.name}</h3>
      ${badge({ family: "access", value: state })}
    </div>
    <ul class="badges" aria-label="Permissions">${permissions}</ul>
    <dl class="facts">
      ${fact("Jeton", html`<span class="mono">${MCP_TOKEN.masked(access.tokenHint)}</span>`)}
      ${fact("Émis le", formatDate(access.createdAt))}
      ${endFact(access, state, input.now)}
      ${fact("Dernier usage", lastUsed)}
    </dl>
    ${state === "active" ? revokeZone(access, input.csrfToken) : ""}
  </li>`;
}

function cards(accesses: readonly McpAccess[], input: AccessListInput): SafeHtml {
  return html`<ol class="accesses">${accesses.map((access) => accessCard(access, input))}</ol>`;
}

function activeSection(active: readonly McpAccess[], input: AccessListInput): SafeHtml {
  const body = active.length === 0
    ? emptyState({
      title: "Aucun accès actif : /mcp refuse toute requête.",
      hint: "Émettez un accès pour brancher Claude Code ; son jeton ne s’affiche qu’une fois.",
    })
    : cards(active, input);
  return html`<section class="stack" aria-labelledby="active-title">
    <h2 class="section__title" id="active-title">Accès actifs</h2>
    ${body}
  </section>`;
}

function inactiveSection(inactive: readonly McpAccess[], input: AccessListInput): SafeHtml {
  if (inactive.length === 0) return html``;
  return html`<section class="stack" aria-labelledby="inactive-title">
    <div class="section__head">
      <h2 class="section__title" id="inactive-title">Expirés ou révoqués</h2>
      <p class="section__note">Effacés ${MCP_ACCESS_RULES.historyDays} jours après</p>
    </div>
    ${cards(inactive, input)}
  </section>`;
}

/** Every access the purge has not taken yet: those that work, then those that stopped. */
export function accessList(input: AccessListInput): SafeHtml {
  const isActive = (access: McpAccess) => mcpAccessState(access, input.now) === "active";
  return html`<div class="stack">
    ${activeSection(input.accesses.filter(isActive), input)}
    ${inactiveSection(input.accesses.filter((access) => !isActive(access)), input)}
  </div>`;
}
