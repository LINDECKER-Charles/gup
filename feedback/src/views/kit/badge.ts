import type { FeedbackKind, FeedbackStatus } from "../../domain/feedback.js";
import { JOURNAL_VOCABULARY } from "../../domain/journal.js";
import { html, type SafeHtml } from "./html.js";
import { LABELS } from "../text/labels.js";

type BadgeSpec =
  | { readonly family: "status"; readonly value: FeedbackStatus }
  | { readonly family: "kind"; readonly value: FeedbackKind }
  | { readonly family: "level"; readonly rank: number };

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
