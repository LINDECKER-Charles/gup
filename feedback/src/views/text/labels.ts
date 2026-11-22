import type { FeedbackKind, FeedbackStatus } from "../../domain/feedback.js";
import type { LogLevel } from "../../domain/journal.js";

/** Every French word the back office shows for a code, in one place. */
export const LABELS = {
  status: {
    new: "Nouveau",
    in_progress: "En cours",
    resolved: "Résolu",
    dismissed: "Écarté",
  } satisfies Record<FeedbackStatus, string>,
  statusTab: {
    new: "Nouveaux",
    in_progress: "En cours",
    resolved: "Résolus",
    dismissed: "Écartés",
  } satisfies Record<FeedbackStatus, string>,
  /** The inbox's title for each status filter. */
  inboxTitle: {
    new: "Nouveaux retours",
    in_progress: "Retours en cours",
    resolved: "Retours résolus",
    dismissed: "Retours écartés",
  } satisfies Record<FeedbackStatus, string>,
  kind: { bug: "Bug", suggestion: "Suggestion" } satisfies Record<FeedbackKind, string>,
  kindFilter: { bug: "Bugs", suggestion: "Suggestions" } satisfies Record<FeedbackKind, string>,
  level: {
    error: "Erreur",
    warn: "Alerte",
    info: "Info",
    debug: "Débogage",
    trace: "Trace",
  } satisfies Record<LogLevel, string>,
  platform: { win32: "Windows", darwin: "macOS", linux: "Linux", other: "Autre" } as Readonly<
    Record<string, string>
  >,
} as const;
