import type { FeedbackKind, FeedbackStatus } from "../../domain/feedback.js";
import type { HistoryKind, LogLevel, UpdateStatus } from "../../domain/journal.js";
import type {
  McpAccessLifetime, McpAccessState, McpPermission,
} from "../../domain/mcp-access.js";

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
  historyKind: { scan: "Analyse", update: "Mise à jour" } satisfies Record<HistoryKind, string>,
  historyKindFilter: {
    scan: "Analyses",
    update: "Mises à jour",
  } satisfies Record<HistoryKind, string>,
  updateStatus: {
    success: "Réussie",
    failed: "Échouée",
    skipped: "Ignorée",
  } satisfies Record<UpdateStatus, string>,
  updateStatusFilter: {
    success: "Réussies",
    failed: "Échouées",
    skipped: "Ignorées",
  } satisfies Record<UpdateStatus, string>,
  platform: { win32: "Windows", darwin: "macOS", linux: "Linux", other: "Autre" } as Readonly<
    Record<string, string>
  >,
  mcpPermission: {
    "feedback:read": "Lire les retours",
    "feedback:triage": "Trier les retours",
    "journals:read": "Lire les journaux",
  } satisfies Record<McpPermission, string>,
  /** What a permission opens, under its box in the issue form. */
  mcpPermissionHint: {
    "feedback:read": "Recherche et détail, adresse du rapporteur comprise.",
    "feedback:triage": "Change le statut et la note privée ; donne aussi la lecture.",
    "journals:read": "Installations, historiques et journaux de débogage partagés.",
  } satisfies Record<McpPermission, string>,
  mcpAccessState: {
    active: "Actif",
    expired: "Expiré",
    revoked: "Révoqué",
  } satisfies Record<McpAccessState, string>,
  mcpLifetime: {
    1: "1 jour",
    7: "7 jours",
    30: "30 jours",
    90: "90 jours",
    365: "1 an",
  } satisfies Record<McpAccessLifetime, string>,
} as const;
