import { mcpAccessState } from "../../../domain/mcp-access.js";
import { html } from "../../kit/html.js";
import { layout } from "../../kit/layout.js";
import { notice } from "../../kit/notice.js";
import { pageHeader } from "../../kit/page-header.js";
import { countOf } from "../../text/count-of.js";
import { accessList, type AccessListInput } from "./access-list.js";
import { issuePanel, type IssuePanelInput } from "./issue-panel.js";

export interface McpPageInput extends AccessListInput, IssuePanelInput {
  readonly notice: string | null;
}

const ACTIVE = { one: "accès actif", many: "accès actifs" } as const;

/** The accesses to /mcp: who may connect, with what, until when; and issuing one. */
export function mcpPage(input: McpPageInput): string {
  const active = input.accesses
    .filter((access) => mcpAccessState(access, input.now) === "active").length;
  return layout({
    title: "MCP",
    signedIn: { csrfToken: input.csrfToken, section: "mcp" },
    main: html`${pageHeader({
      kicker: "04 / MCP",
      title: "Accès MCP",
      meta: html`<span>${countOf(active, ACTIVE)}</span>
        <span class="mono">${input.setup.url}</span>`,
    })}
      ${notice(input.notice)}
      <div class="detail">
        ${accessList(input)}
        ${issuePanel(input)}
      </div>`,
  });
}
