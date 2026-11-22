import type { FeedbackKind, FeedbackStatus } from "../../domain/feedback.js";
import { JOURNAL_VOCABULARY, type HistoryKind } from "../../domain/journal.js";
import type { McpAccessState, McpPermission } from "../../domain/mcp-access.js";
import { html, type SafeHtml } from "./html.js";
import { LABELS } from "../text/labels.js";

type BadgeSpec =
  | { readonly family: "status"; readonly value: FeedbackStatus }
  | { readonly family: "kind"; readonly value: FeedbackKind }
  | { readonly family: "level"; readonly rank: number }
  | { readonly family: "entry"; readonly value: HistoryKind }
  /** An update's status: free text in the contract, a known word or shown as sent. */
  | { readonly family: "outcome"; readonly value: string }
  | { readonly family: "access"; readonly value: McpAccessState }
  | { readonly family: "permission"; readonly value: McpPermission };

const UNKNOWN_OUTCOME_TONE = "outcome-other";

function outcome(value: string): { text: string; tone: string } {
  const known = JOURNAL_VOCABULARY.updateStatuses.find((status) => status === value);
  return known === undefined
    ? { text: value, tone: UNKNOWN_OUTCOME_TONE }
    : { text: LABELS.updateStatus[known], tone: `outcome-${known}` };
}

function describe(spec: BadgeSpec): { text: string; tone: string } {
  switch (spec.family) {
    case "status":
      return { text: LABELS.status[spec.value], tone: `status-${spec.value}` };
    case "kind":
      return { text: LABELS.kind[spec.value], tone: `kind-${spec.value}` };
    case "level": {
      const level = JOURNAL_VOCABULARY.logLevels[spec.rank] ?? "trace";
      return { text: LABELS.level[level], tone: `level-${level}` };
    }
    case "entry":
      return { text: LABELS.historyKind[spec.value], tone: `entry-${spec.value}` };
    case "outcome":
      return outcome(spec.value);
    case "access":
      return { text: LABELS.mcpAccessState[spec.value], tone: `access-${spec.value}` };
    case "permission":
      return { text: LABELS.mcpPermission[spec.value], tone: "permission" };
  }
}

/**
 * A coloured badge that always carries its text: the colour helps scanning,
 * it never is the only signal.
 */
export function badge(spec: BadgeSpec): SafeHtml {
  const { text, tone } = describe(spec);
  return html`<span class="badge badge--${tone}">${text}</span>`;
}
