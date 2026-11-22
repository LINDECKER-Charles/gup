import {
  MCP_ACCESS_LIFETIMES, MCP_ACCESS_RULES, MCP_PERMISSIONS, type McpAccessLifetime,
  type McpPermission,
} from "../../../domain/mcp-access.js";
import { ADMIN_UI } from "../../admin-ui.js";
import { csrfField } from "../../csrf-field.js";
import { html, type SafeHtml } from "../../kit/html.js";
import { LABELS } from "../../text/labels.js";
import { claudeMcpAddCommand, type ClaudeCodeSetup } from "./claude-code-setup.js";

/** The issue form's fields, as typed: what a refused form shows back. */
export interface McpAccessFormValues {
  readonly name: string;
  readonly permissions: readonly McpPermission[];
  readonly lifetimeDays: McpAccessLifetime;
}

export type McpAccessFormField = "name" | "permissions" | "lifetime";

export interface McpAccessForm {
  readonly values: McpAccessFormValues;
  /** One sentence per refused field, said next to it; null when the field is fine. */
  readonly errors: Readonly<Record<McpAccessFormField, string | null>>;
}

export interface IssuePanelInput {
  readonly csrfToken: string;
  readonly form: McpAccessForm;
  readonly setup: ClaudeCodeSetup;
}

const FIELD_IDS = {
  name: "access-name",
  permissions: "access-permissions",
  lifetime: "access-lifetime",
} as const satisfies Record<McpAccessFormField, string>;

/** The first refused field takes the focus: without script, a reload lands on it. */
function firstInvalid(form: McpAccessForm): McpAccessFormField | null {
  const fields: readonly McpAccessFormField[] = ["name", "permissions", "lifetime"];
  return fields.find((field) => form.errors[field] !== null) ?? null;
}

/** The error under a field, and the attributes that tie it to its control. */
function errorOf(form: McpAccessForm, field: McpAccessFormField) {
  const message = form.errors[field];
  const id = `${FIELD_IDS[field]}-error`;
  if (message === null) return { message: html``, describedBy: "", invalid: html`` };
  const focus = firstInvalid(form) === field ? html` autofocus` : html``;
  return {
    message: html`<p class="field-error" id="${id}">${message}</p>`,
    describedBy: ` ${id}`,
    invalid: html` aria-invalid="true"${focus}`,
  };
}

function nameField(form: McpAccessForm): SafeHtml {
  const id = FIELD_IDS.name;
  const error = errorOf(form, "name");
  return html`<div class="field">
    <label class="field-label" for="${id}">Nom</label>
    <input class="field-control" id="${id}" name="name" type="text" required
      maxlength="${MCP_ACCESS_RULES.maxNameLength}" autocomplete="off" spellcheck="false"
      value="${form.values.name}" aria-describedby="${id}-hint${error.describedBy}"${error.invalid}>
    <p class="field-note" id="${id}-hint">L’outil et la machine qui s’en servent :
      « Claude Code, portable ».</p>
    ${error.message}
  </div>`;
}

function permissionOption(form: McpAccessForm, permission: McpPermission, focus: SafeHtml) {
  const id = `permission-${permission.replace(":", "-")}`;
  const checked = form.values.permissions.includes(permission) ? html` checked` : html``;
  return html`<label class="option" for="${id}">
    <input id="${id}" name="permissions" type="checkbox" value="${permission}"${checked}${focus}>
    <span class="option__text">
      <span class="option__label">${LABELS.mcpPermission[permission]}</span>
      <span class="option__hint">${LABELS.mcpPermissionHint[permission]}</span>
    </span>
  </label>`;
}

function permissionsField(form: McpAccessForm): SafeHtml {
  const error = errorOf(form, "permissions");
  const focus = firstInvalid(form) === "permissions" ? html` autofocus` : html``;
  const options = MCP_PERMISSIONS.map((permission, index) =>
    permissionOption(form, permission, index === 0 ? focus : html``));
  const describedBy = error.describedBy.trim();
  const described = describedBy === "" ? html`` : html` aria-describedby="${describedBy}"`;
  return html`<fieldset class="field options" id="${FIELD_IDS.permissions}"${described}>
    <legend class="field-label">Permissions</legend>
    ${options}
    ${error.message}
  </fieldset>`;
}

function lifetimeField(form: McpAccessForm): SafeHtml {
  const id = FIELD_IDS.lifetime;
  const error = errorOf(form, "lifetime");
  const options = MCP_ACCESS_LIFETIMES.map((days) => {
    const selected = days === form.values.lifetimeDays ? html` selected` : html``;
    return html`<option value="${days}"${selected}>${LABELS.mcpLifetime[days]}</option>`;
  });
  return html`<div class="field">
    <label class="field-label" for="${id}">Durée</label>
    <select class="field-control" id="${id}" name="lifetime"
      aria-describedby="${id}-hint${error.describedBy}"${error.invalid}>${options}</select>
    <p class="field-note" id="${id}-hint">Passé ce délai, le jeton est refusé : aucun accès
      n’est illimité.</p>
    ${error.message}
  </div>`;
}

function issueForm(input: IssuePanelInput): SafeHtml {
  const { form } = input;
  const refused = firstInvalid(form) === null
    ? html``
    : html`<p class="alert" role="alert">L’accès n’a pas été émis : corrigez les champs
      signalés.</p>`;
  return html`<form class="panel__part form" method="post" action="${ADMIN_UI.mcpPath}">
    ${csrfField(input.csrfToken)}
    <h2 class="panel__title" id="issue-title">Émettre un accès</h2>
    ${refused}
    ${nameField(form)}
    ${permissionsField(form)}
    ${lifetimeField(form)}
    <div class="form__actions">
      <button class="btn btn--primary btn--small" type="submit">Émettre l’accès</button>
    </div>
    <p class="field-note">Le jeton s’affiche une seule fois, à la page suivante ; le service
      n’en garde que l’empreinte.</p>
  </form>`;
}

/** A line breaks between groups, never inside one that fits: `--scope` stays whole. */
function commandParts(parts: readonly string[]): SafeHtml {
  return html`${parts.map((part, index) =>
    html`${index === 0 ? "" : " "}<span class="command__part">${part}</span>`)}`;
}

/** Shared with the token page: what to do with a token once it is copied. */
export function connectSteps(setup: ClaudeCodeSetup): SafeHtml {
  return html`<ol class="steps">
    <li>Mettez le jeton dans la variable d’environnement utilisateur
      <code>${setup.envVar}</code> de votre machine.</li>
    <li>Une fois par machine, enregistrez le serveur :
      <pre class="command"><code>${commandParts(claudeMcpAddCommand(setup))}</code></pre></li>
    <li>Relancez Claude Code ; <code>claude mcp get ${setup.serverName}</code> doit
      répondre « connected ».</li>
  </ol>`;
}

/** Issuing an access, then plugging Claude Code in. */
export function issuePanel(input: IssuePanelInput): SafeHtml {
  return html`<aside class="panel detail__side" aria-labelledby="issue-title">
    ${issueForm(input)}
    <div class="panel__part">
      <h2 class="panel__title">Brancher Claude Code</h2>
      ${connectSteps(input.setup)}
    </div>
  </aside>`;
}
