/**
 * The words of updates that run inside the app (French, the language of the
 * interface): the run view, its dialogs and the update confirmation's extra
 * paragraphs. Exported so the tests assert the exact wording. Symbols come
 * from `STATUS_GLYPHS` where the run view draws them, never from here.
 */

/** Windows elevates through a UAC window; elsewhere sudo asks in the terminal pane. */
export type ElevationKind = "uac" | "sudo";

export function elevationKindOf(platform: NodeJS.Platform): ElevationKind {
  return platform === "win32" ? "uac" : "sudo";
}

export const RUN_TITLES = {
  running: "Mise à jour",
  stopping: "Mise à jour — arrêt demandé",
  done: "Mise à jour — terminée",
} as const;

export const RUN_FACTS = {
  running: "Mise à jour",
  done: "Mise à jour terminée",
  total: (count: number): string => `${count} paquet(s)`,
} as const;

export const RUN_SUMMARY = {
  succeeded: (count: number): string => `${count} mis à jour`,
  skipped: (count: number): string => `${count} ignoré(s)`,
  failed: (count: number): string => `${count} échec(s)`,
  cancelled: (count: number): string => `${count} annulé(s)`,
  elapsed: (clock: string): string => `en ${clock}`,
} as const;

export const RUN_TAGS = {
  admin: "admin",
  elevating: { uac: "fenêtre admin…", sudo: "sudo…" } satisfies Record<ElevationKind, string>,
  retry: (label: string): string => `↻ ${label}`,
} as const;

export const RUN_MESSAGES = {
  retryable: (message: string): string => `${message} — réessai proposé à la fin`,
  failedWithoutMessage: "échec",
  cancelled: "annulé (arrêt demandé)",
} as const;

export const RUN_WAITING = {
  scheduled: "Une mise à jour planifiée est en cours",
  interactive: "Une autre mise à jour gup est en cours",
  line: (who: string, since: string): string => `${who} (commencée ${since}) — attente…`,
} as const;

export const PANE_LABELS = {
  title: (provider: string, packageName: string): string => `${provider} · ${packageName}`,
  output: (title: string): string => `${title} — sortie`,
  admin: { uac: "Administrateur (UAC)", sudo: "Administrateur (sudo)" } satisfies Record<
    ElevationKind,
    string
  >,
  focused: "saisie active · Ctrl+G pour rendre la main",
  notRetained: "Sortie non conservée (mise à jour réussie).",
  noOutput: "Aucune sortie pour ce paquet.",
  approveUac: "Validez l'invite UAC.",
  adminElsewhere: (count: number): string =>
    `${count} paquet(s) s'installent dans la fenêtre administrateur ; gup reprend à sa fermeture.`,
} as const;

export const RUN_HINTS = {
  running: (isEnlarged: boolean): string =>
    "s passer ce paquet · x tout arrêter · t écrire dans le terminal · " +
    (isEnlarged ? "v réduire le terminal" : "v agrandir le terminal"),
  typing: "Les touches vont au programme · Ctrl+C lui est transmis · Ctrl+G rendre la main à gup",
  elevating: {
    uac: "En attente de la fenêtre administrateur — x arrêter après cette étape",
    sudo: "Étape administrateur (sudo) — t écrire dans le terminal · x arrêter après cette étape",
  } satisfies Record<ElevationKind, string>,
  waiting: "En attente de l'autre mise à jour — x tout arrêter",
  done: (isEnlarged: boolean): string =>
    "↑↓ choisir un paquet · " +
    (isEnlarged ? "v réduire la sortie" : "v agrandir la sortie") +
    " · entrée retour aux paquets",
} as const;

export const RUN_NOTICES = {
  quit: "Mise à jour en cours — x pour l'arrêter.",
  skipped: "Paquet en cours ignoré.",
  skipIdle: "Rien à interrompre pour le moment.",
  skipAdmin: {
    uac:
      "L'étape administrateur se déroule dans sa propre fenêtre : " +
      "impossible de l'interrompre d'ici.",
    sudo: "L'étape administrateur traite tout le lot d'un bloc : x pour arrêter après elle.",
  } satisfies Record<ElevationKind, string>,
  ctrlCFirst: "Paquet en cours ignoré — Ctrl+C ×2 pour tout arrêter.",
  ctrlCDouble: "Arrêt demandé — les paquets restants sont annulés.",
  stopAfterStep: "Arrêt demandé — gup s'arrêtera après l'étape administrateur.",
  prompt: "⌨ Le programme attend peut-être une réponse — t pour écrire dans le terminal.",
  typeIdle: "Aucun programme en cours.",
} as const;

export const STOP_DIALOG = {
  title: "Tout arrêter ?",
  text: (remaining: number): string =>
    `Le paquet en cours est interrompu et les ${remaining} paquet(s) restant(s) sont annulés.`,
} as const;

export const ELEVATE_DIALOG = {
  title: "Droits administrateur",
  text: {
    uac: (count: number): string =>
      `${count} paquet(s) nécessitent les droits administrateur. ` +
      "Ouvrir une invite UAC pour les traiter en bloc ?",
    sudo: (count: number): string =>
      `${count} paquet(s) nécessitent les droits administrateur : sudo demandera votre mot ` +
      "de passe dans le terminal. Les traiter en bloc ?",
  } satisfies Record<ElevationKind, (count: number) => string>,
} as const;

export const RETRY_DIALOG_TITLE = "Échecs récupérables";

/** The update confirmation's paragraphs added by the in-screen launcher. */
export const CONFIRM_EXTRA = {
  adminTag: "(admin)",
  admin: {
    uac: (count: number): string =>
      `${count} paquet(s) nécessitent les droits administrateur : ` +
      "une invite UAC s'ouvrira en fin de lot.",
    sudo: (count: number): string =>
      `${count} paquet(s) nécessitent les droits administrateur : ` +
      "sudo demandera votre mot de passe.",
  } satisfies Record<ElevationKind, (count: number) => string>,
  fallback: (reason: string): string =>
    `Terminal intégré indisponible (${reason}) : la mise à jour s'exécutera dans le terminal, ` +
    "hors de l'interface.",
} as const;

export const LAUNCH_ERROR = {
  title: "Mise à jour",
  text: (message: string): string => `La mise à jour s'est interrompue : ${message}`,
  back: "Retour aux paquets",
} as const;

/** The terminal notification at the end of a long run. */
export const RUN_NOTIFICATION = {
  title: "gup",
  body: (succeeded: number, skipped: number, failed: number): string =>
    `Mise à jour terminée : ${succeeded} mis à jour, ${skipped} ignoré(s), ${failed} échec(s).`,
} as const;

