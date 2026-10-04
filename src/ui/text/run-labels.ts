import { localized } from "../../core/i18n/localized.js";
import type { BatchHolder } from "../../core/update/update-extensions.js";
import { counted, formatRelative } from "./format.js";

/**
 * The words of updates, in the interface's languages: the run view, its
 * dialogs, the update confirmation's extra paragraphs and the `gup doctor`
 * line of the embedded terminal — and the wait for another gup run, which the
 * plain terminal of `gup update` words alike. The run view's key hints and
 * the notices its keys leave live in `run-key-labels.ts`. Exported so the
 * tests assert the exact wording. Symbols come from `STATUS_GLYPHS` where the
 * run view draws them, never from here.
 */

/** Windows elevates through a UAC window; elsewhere sudo asks in the terminal pane. */
export type ElevationKind = "uac" | "sudo";

export function elevationKindOf(platform: NodeJS.Platform): ElevationKind {
  return platform === "win32" ? "uac" : "sudo";
}

export const RUN_TITLES = localized({
  en: {
    running: "Update",
    stopping: "Update — stop requested",
    done: "Update — finished",
  },
  fr: {
    running: "Mise à jour",
    stopping: "Mise à jour — arrêt demandé",
    done: "Mise à jour — terminée",
  },
});

export const RUN_FACTS = localized({
  en: {
    running: "Update",
    done: "Update finished",
    total: (count: number): string => counted(count, "package", "packages"),
  },
  fr: {
    running: "Mise à jour",
    done: "Mise à jour terminée",
    total: (count) => `${count} paquet(s)`,
  },
});

/**
 * An update's outcome. In French it agrees with « mise à jour », as in the
 * Journal and the HTML report: `ignorée`, `annulée`; the row of the package
 * says the same.
 */
export const RUN_SUMMARY = localized({
  en: {
    succeeded: (count: number): string => `${count} updated`,
    skipped: (count: number): string => counted(count, "skipped", "skipped"),
    failed: (count: number): string => counted(count, "failed", "failed"),
    cancelled: (count: number): string => counted(count, "cancelled", "cancelled"),
    elapsed: (clock: string): string => `in ${clock}`,
  },
  fr: {
    succeeded: (count) => `${count} mis à jour`,
    skipped: (count) => counted(count, "ignorée", "ignorées"),
    failed: (count) => counted(count, "échec", "échecs"),
    cancelled: (count) => counted(count, "annulée", "annulées"),
    elapsed: (clock) => `en ${clock}`,
  },
});

export const RUN_TAGS = localized({
  en: {
    admin: "admin",
    elevating: { uac: "admin window…", sudo: "sudo…" } satisfies Record<ElevationKind, string>,
  },
  fr: {
    admin: "admin",
    elevating: { uac: "fenêtre admin…", sudo: "sudo…" },
  },
});

export const RUN_MESSAGES = localized({
  en: {
    retryable: (message: string): string => `${message} — retry offered at the end`,
    failedWithoutMessage: "failed",
    cancelled: "cancelled (stop requested)",
  },
  fr: {
    retryable: (message) => `${message} — réessai proposé à la fin`,
    failedWithoutMessage: "échec",
    cancelled: "annulée (arrêt demandé)",
  },
});

export const RUN_WAITING = localized({
  en: {
    scheduled: "A scheduled update is running",
    interactive: "Another gup update is running",
    /** The plain terminal's way out of the wait. */
    abandon: "Ctrl+C to abort",
    /** Since when the holder runs: "(started 4 min ago)". */
    since: (when: string): string => `(started ${when})`,
    waiting: "waiting…",
  },
  fr: {
    scheduled: "Une mise à jour planifiée est en cours",
    interactive: "Une autre mise à jour gup est en cours",
    abandon: "Ctrl+C pour abandonner",
    since: (when) => `(commencée ${when})`,
    waiting: "attente…",
  },
});

/**
 * "A scheduled update is running (started 4 min ago) — waiting…": who holds
 * the update batch and since when, seen from `now`. The run view and the
 * plain terminal say it alike.
 */
export function waitingMessage(holder: BatchHolder | null, now: Date): string {
  const who = holder?.kind === "scheduled" ? RUN_WAITING.scheduled : RUN_WAITING.interactive;
  if (!holder) return `${who} — ${RUN_WAITING.waiting}`;
  const since = RUN_WAITING.since(formatRelative(new Date(holder.startedAt), now));
  return `${who} ${since} — ${RUN_WAITING.waiting}`;
}

/** "Winget · Git": the pane of one package, alike in every language. */
function packagePaneTitle(provider: string, packageName: string): string {
  return `${provider} · ${packageName}`;
}

export const PANE_LABELS = localized({
  en: {
    title: packagePaneTitle,
    output: (title: string): string => `${title} — output`,
    admin: {
      uac: "Administrator (UAC)",
      sudo: "Administrator (sudo)",
    } satisfies Record<ElevationKind, string>,
    focused: "input active · Ctrl+G to give control back",
    notRetained: "Output not kept (the update succeeded).",
    noOutput: "No output for this package.",
    approveUac: "Approve the UAC prompt.",
    adminElsewhere: (count: number): string =>
      `${counted(count, "package installs", "packages install")} in the administrator ` +
      "window; gup resumes once it closes.",
  },
  fr: {
    title: packagePaneTitle,
    output: (title) => `${title} — sortie`,
    admin: { uac: "Administrateur (UAC)", sudo: "Administrateur (sudo)" },
    focused: "saisie active · Ctrl+G pour rendre la main",
    notRetained: "Sortie non conservée (mise à jour réussie).",
    noOutput: "Aucune sortie pour ce paquet.",
    approveUac: "Validez l'invite UAC.",
    adminElsewhere: (count) =>
      `${counted(count, "paquet s'installe", "paquets s'installent")} dans la fenêtre ` +
      "administrateur ; gup reprend à sa fermeture.",
  },
});

/** The keys of an update on the plain terminal, printed as the batch starts. */
export const CONSOLE_KEYS = localized({
  en: {
    skip: "Ctrl+C: skip the stuck install",
    stopAll: "Ctrl+C ×2: stop all",
    timeout: (seconds: number): string =>
      seconds > 0 ? `auto timeout ${seconds}s` : "auto timeout off",
  },
  fr: {
    skip: "Ctrl+C : passer l'install bloquée",
    stopAll: "Ctrl+C ×2 : tout arrêter",
    timeout: (seconds) => (seconds > 0 ? `timeout auto ${seconds}s` : "timeout auto désactivé"),
  },
});

export const STOP_DIALOG = localized({
  en: {
    title: "Stop all?",
    text: (remaining: number): string => {
      if (remaining === 0) return "The current package is interrupted.";
      const rest =
        remaining === 1
          ? "the remaining package is cancelled"
          : `the ${remaining} remaining packages are cancelled`;
      return `The current package is interrupted and ${rest}.`;
    },
  },
  fr: {
    title: "Tout arrêter ?",
    text: (remaining) => {
      if (remaining === 0) return "Le paquet en cours est interrompu.";
      const rest =
        remaining === 1
          ? "le paquet restant est annulé"
          : `les ${remaining} paquets restants sont annulés`;
      return `Le paquet en cours est interrompu et ${rest}.`;
    },
  },
});

/** "2 packages need administrator rights": the opening of every admin message. */
function adminNeedEn(count: number): string {
  return `${counted(count, "package needs", "packages need")} administrator rights`;
}

/** "2 paquets nécessitent les droits administrateur". */
function adminNeedFr(count: number): string {
  return `${counted(count, "paquet nécessite", "paquets nécessitent")} les droits administrateur`;
}

export const ELEVATE_DIALOG = localized({
  en: {
    title: "Administrator rights",
    text: {
      uac: (count: number): string =>
        `${adminNeedEn(count)}. Open a UAC prompt to ` +
        `${count === 1 ? "handle it" : "handle them in one batch"}?`,
      sudo: (count: number): string =>
        `${adminNeedEn(count)}: sudo will ask for your password in the terminal. ` +
        `${count === 1 ? "Handle it" : "Handle them in one batch"}?`,
    } satisfies Record<ElevationKind, (count: number) => string>,
  },
  fr: {
    title: "Droits administrateur",
    text: {
      uac: (count) =>
        `${adminNeedFr(count)}. Ouvrir une invite UAC pour ` +
        `${count <= 1 ? "le traiter" : "les traiter en bloc"} ?`,
      sudo: (count) =>
        `${adminNeedFr(count)} : sudo demandera votre mot de passe dans le terminal. ` +
        `${count <= 1 ? "Le traiter" : "Les traiter en bloc"} ?`,
    },
  },
});

/** Failures a retry pass could fix: which strategy, if any, to replay them with. */
export const RETRY_DIALOG = localized({
  en: { title: "Recoverable failures" },
  fr: { title: "Échecs récupérables" },
});

/** The update confirmation's paragraphs added by the in-screen launcher. */
export const CONFIRM_EXTRA = localized({
  en: {
    adminTag: "(admin)",
    admin: {
      uac: (count: number): string =>
        `${adminNeedEn(count)}: a UAC prompt will open at the end of the batch.`,
      sudo: (count: number): string => `${adminNeedEn(count)}: sudo will ask for your password.`,
    } satisfies Record<ElevationKind, (count: number) => string>,
    fallback: (reason: string): string =>
      `Embedded terminal unavailable (${reason}): the update will run in the terminal, ` +
      "outside the interface.",
  },
  fr: {
    adminTag: "(admin)",
    admin: {
      uac: (count) => `${adminNeedFr(count)} : une invite UAC s'ouvrira en fin de lot.`,
      sudo: (count) => `${adminNeedFr(count)} : sudo demandera votre mot de passe.`,
    },
    fallback: (reason) =>
      `Terminal intégré indisponible (${reason}) : la mise à jour s'exécutera dans le terminal, ` +
      "hors de l'interface.",
  },
});

export const LAUNCH_ERROR = localized({
  en: {
    title: "Update",
    text: (message: string): string => `The update was interrupted: ${message}`,
    /** "Back" alone, as on the results: a run-now goes back to Schedules. */
    back: "Back",
  },
  fr: {
    title: "Mise à jour",
    text: (message) => `La mise à jour s'est interrompue : ${message}`,
    back: "Retour",
  },
});

/** "1 updated, 2 skipped, 0 failed": what a run did, in the active language. */
function outcomeSummary(succeeded: number, skipped: number, failed: number): string {
  return [
    RUN_SUMMARY.succeeded(succeeded),
    RUN_SUMMARY.skipped(skipped),
    RUN_SUMMARY.failed(failed),
  ].join(", ");
}

/** The terminal notification at the end of a long run. */
export const RUN_NOTIFICATION = localized({
  en: {
    title: "gup",
    body: (succeeded: number, skipped: number, failed: number): string =>
      `Update finished: ${outcomeSummary(succeeded, skipped, failed)}.`,
  },
  fr: {
    title: "gup",
    body: (succeeded, skipped, failed) =>
      `Mise à jour terminée : ${outcomeSummary(succeeded, skipped, failed)}.`,
  },
});

/** The `gup doctor` line of the embedded terminal ("System" section). */
export const TERMINAL_DIAGNOSTIC = localized({
  en: {
    label: "Embedded terminal",
    available: "available — updates run in the interface",
    unavailable: (reason: string): string => `${reason} — updates run outside the interface`,
  },
  fr: {
    label: "Terminal intégré",
    available: "disponible — mises à jour dans l'interface",
    unavailable: (reason) => `${reason} — mises à jour hors de l'interface`,
  },
});
