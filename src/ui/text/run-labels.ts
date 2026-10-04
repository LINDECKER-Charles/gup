import type { BatchHolder } from "../../core/update/update-extensions.js";
import { counted, formatRelative } from "./format.js";

/**
 * The words of updates (French, the language of the interface): the run
 * view, its dialogs, the update confirmation's extra paragraphs and the
 * `gup doctor` line of the embedded terminal — and the wait for another gup
 * run, which the plain terminal of `gup update` words alike. Exported so the
 * tests assert the exact wording. Symbols come from `STATUS_GLYPHS` where
 * the run view draws them, never from here.
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

/**
 * An update's outcome agrees with « mise à jour », as in the Journal and the
 * HTML report: `ignorée`, `annulée`; the row of the package says the same.
 */
export const RUN_SUMMARY = {
  succeeded: (count: number): string => `${count} mis à jour`,
  skipped: (count: number): string => counted(count, "ignorée", "ignorées"),
  failed: (count: number): string => counted(count, "échec", "échecs"),
  cancelled: (count: number): string => counted(count, "annulée", "annulées"),
  elapsed: (clock: string): string => `en ${clock}`,
} as const;

export const RUN_TAGS = {
  admin: "admin",
  elevating: { uac: "fenêtre admin…", sudo: "sudo…" } satisfies Record<ElevationKind, string>,
} as const;

export const RUN_MESSAGES = {
  retryable: (message: string): string => `${message} — réessai proposé à la fin`,
  failedWithoutMessage: "échec",
  cancelled: "annulée (arrêt demandé)",
} as const;

export const RUN_WAITING = {
  scheduled: "Une mise à jour planifiée est en cours",
  interactive: "Une autre mise à jour gup est en cours",
  /** The plain terminal's way out of the wait. */
  abandon: "Ctrl+C pour abandonner",
} as const;

/**
 * "Une mise à jour planifiée est en cours (commencée il y a 4 min) — attente…":
 * who holds the update batch and since when, seen from `now`. The run view
 * and the plain terminal say it alike.
 */
export function waitingMessage(holder: BatchHolder | null, now: Date): string {
  const who = holder?.kind === "scheduled" ? RUN_WAITING.scheduled : RUN_WAITING.interactive;
  if (!holder) return `${who} — attente…`;
  return `${who} (commencée ${formatRelative(new Date(holder.startedAt), now)}) — attente…`;
}

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
    `${counted(count, "paquet s'installe", "paquets s'installent")} dans la fenêtre ` +
    "administrateur ; gup reprend à sa fermeture.",
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
  /**
   * The results' keys, most needed first: the bar cuts from the end, and the
   * keys other views add (`o rapport HTML`) go between `back` and `resize`.
   * "retour" alone: a run started from Planification goes back there.
   */
  done: {
    select: "↑↓ choisir un paquet",
    back: "entrée retour",
    resize: (isEnlarged: boolean): string =>
      isEnlarged ? "v réduire la sortie" : "v agrandir la sortie",
  },
} as const;

/** The keys of an update on the plain terminal, printed as the batch starts. */
export const CONSOLE_KEYS = {
  skip: "Ctrl+C : passer l'install bloquée",
  stopAll: "Ctrl+C ×2 : tout arrêter",
  timeout: (seconds: number): string =>
    seconds > 0 ? `timeout auto ${seconds}s` : "timeout auto désactivé",
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
  prompt: "Le programme attend peut-être une réponse — t pour écrire dans le terminal.",
  typeIdle: "Aucun programme en cours.",
  /** `t` during the UAC step: the elevated installers run in a window of their own. */
  typeElsewhere:
    "L'étape administrateur a sa propre fenêtre : répondez-y directement, rien ne se tape ici.",
  actionFailed: (reason: string): string => `Action impossible : ${reason}`,
} as const;

export const STOP_DIALOG = {
  title: "Tout arrêter ?",
  text: (remaining: number): string => {
    if (remaining === 0) return "Le paquet en cours est interrompu.";
    const rest =
      remaining === 1
        ? "le paquet restant est annulé"
        : `les ${remaining} paquets restants sont annulés`;
    return `Le paquet en cours est interrompu et ${rest}.`;
  },
} as const;

/** "2 paquets nécessitent les droits administrateur": the opening of every admin message. */
function adminNeed(count: number): string {
  return `${counted(count, "paquet nécessite", "paquets nécessitent")} les droits administrateur`;
}

export const ELEVATE_DIALOG = {
  title: "Droits administrateur",
  text: {
    uac: (count: number): string =>
      `${adminNeed(count)}. Ouvrir une invite UAC pour ` +
      `${count <= 1 ? "le traiter" : "les traiter en bloc"} ?`,
    sudo: (count: number): string =>
      `${adminNeed(count)} : sudo demandera votre mot de passe dans le terminal. ` +
      `${count <= 1 ? "Le traiter" : "Les traiter en bloc"} ?`,
  } satisfies Record<ElevationKind, (count: number) => string>,
} as const;

export const RETRY_DIALOG_TITLE = "Échecs récupérables";

/** The update confirmation's paragraphs added by the in-screen launcher. */
export const CONFIRM_EXTRA = {
  adminTag: "(admin)",
  admin: {
    uac: (count: number): string => `${adminNeed(count)} : une invite UAC s'ouvrira en fin de lot.`,
    sudo: (count: number): string => `${adminNeed(count)} : sudo demandera votre mot de passe.`,
  } satisfies Record<ElevationKind, (count: number) => string>,
  fallback: (reason: string): string =>
    `Terminal intégré indisponible (${reason}) : la mise à jour s'exécutera dans le terminal, ` +
    "hors de l'interface.",
} as const;

export const LAUNCH_ERROR = {
  title: "Mise à jour",
  text: (message: string): string => `La mise à jour s'est interrompue : ${message}`,
  /** "Retour" alone, as on the results: a run-now goes back to Planification. */
  back: "Retour",
} as const;

/** The terminal notification at the end of a long run. */
export const RUN_NOTIFICATION = {
  title: "gup",
  body: (succeeded: number, skipped: number, failed: number): string =>
    `Mise à jour terminée : ${RUN_SUMMARY.succeeded(succeeded)}, ` +
    `${RUN_SUMMARY.skipped(skipped)}, ${RUN_SUMMARY.failed(failed)}.`,
} as const;

/** The `gup doctor` line of the embedded terminal ("Système" section). */
export const TERMINAL_DIAGNOSTIC = {
  label: "Terminal intégré",
  available: "disponible — mises à jour dans l'interface",
  unavailable: (reason: string): string => `${reason} — mises à jour hors de l'interface`,
} as const;
