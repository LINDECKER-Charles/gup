import type { McpAccessRequest } from "../../auth/mcp-accesses.js";
import {
  DEFAULT_MCP_ACCESS_LIFETIME, MCP_ACCESS_LIFETIMES, MCP_ACCESS_RULES, MCP_PERMISSIONS,
  type McpAccessLifetime,
} from "../../domain/mcp-access.js";
import type { McpAccessForm } from "../../views/pages/mcp/issue-panel.js";
import { RequestParams } from "./request-params.js";

export type McpAccessFormResult =
  | { readonly isValid: true; readonly request: McpAccessRequest }
  | { readonly isValid: false; readonly form: McpAccessForm };

/** The least an access can do, ticked by default: anything more is a choice. */
export const BLANK_MCP_ACCESS_FORM: McpAccessForm = {
  values: { name: "", permissions: ["feedback:read"], lifetimeDays: DEFAULT_MCP_ACCESS_LIFETIME },
  errors: { name: null, permissions: null, lifetime: null },
};

const LIFETIME_VALUES = MCP_ACCESS_LIFETIMES.map(String);
/** Control characters have no place in a label shown on a page and in a log. */
const CONTROL_CHARACTER = /\p{Cc}/u;

function nameError(name: string): string | null {
  if (name === "") return "Donnez un nom à l’accès : l’outil et la machine qui s’en servent.";
  if ([...name].length > MCP_ACCESS_RULES.maxNameLength) {
    return `${MCP_ACCESS_RULES.maxNameLength} caractères au plus.`;
  }
  return CONTROL_CHARACTER.test(name) ? "Un nom tient sur une ligne de texte simple." : null;
}

function lifetimeOf(params: RequestParams): McpAccessLifetime | null {
  const value = params.choice("lifetime", LIFETIME_VALUES);
  return MCP_ACCESS_LIFETIMES.find((days) => String(days) === value) ?? null;
}

/** Reads and checks a submitted issue form: a request to issue, or the form with its errors. */
export function readMcpAccessForm(body: unknown): McpAccessFormResult {
  const params = new RequestParams(body);
  const name = (params.text("name") ?? "").replace(/\s+/g, " ").trim();
  const permissions = params.choices("permissions", MCP_PERMISSIONS);
  const lifetimeDays = lifetimeOf(params);
  const errors = {
    name: nameError(name),
    permissions: permissions.length === 0 ? "Cochez au moins une permission." : null,
    lifetime: lifetimeDays === null ? "Choisissez une durée dans la liste." : null,
  };
  if (lifetimeDays !== null && Object.values(errors).every((error) => error === null)) {
    return { isValid: true, request: { name, permissions, lifetimeDays } };
  }
  const values = { name, permissions, lifetimeDays: lifetimeDays ?? DEFAULT_MCP_ACCESS_LIFETIME };
  return { isValid: false, form: { values, errors } };
}
