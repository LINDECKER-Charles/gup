import { localized } from "../../core/i18n/localized.js";
import type { ElevationKind } from "./run-labels.js";

/**
 * The run view's keys and what pressing them says, in the interface's
 * languages: the key-hint bar of each mode, and the notice a key leaves
 * under the progress line. The rest of the run's words are in
 * `run-labels.ts`. Exported so the tests assert the exact wording.
 */

export const RUN_HINTS = localized({
  en: {
    running: (isEnlarged: boolean): string =>
      "s skip this package · x stop all · t type in the terminal · " +
      (isEnlarged ? "v shrink the terminal" : "v enlarge the terminal"),
    typing: "Keys go to the program · Ctrl+C is passed on to it · Ctrl+G back to gup",
    elevating: {
      uac: "Waiting for the administrator window — x stop after this step",
      sudo: "Administrator step (sudo) — t type in the terminal · x stop after this step",
    } satisfies Record<ElevationKind, string>,
    waiting: "Waiting for the other update — x stop all",
    /**
     * The results' keys, most needed first: the bar cuts from the end, and the
     * keys other views add (`o HTML report`) go between `back` and `resize`.
     * "back" alone: a run started from Schedules goes back there.
     */
    done: {
      select: "↑↓ choose a package",
      back: "enter back",
      resize: (isEnlarged: boolean): string =>
        isEnlarged ? "v shrink the output" : "v enlarge the output",
    },
  },
  fr: {
    running: (isEnlarged) =>
      "s passer ce paquet · x tout arrêter · t écrire dans le terminal · " +
      (isEnlarged ? "v réduire le terminal" : "v agrandir le terminal"),
    typing:
      "Les touches vont au programme · Ctrl+C lui est transmis · Ctrl+G rendre la main à gup",
    elevating: {
      uac: "En attente de la fenêtre administrateur — x arrêter après cette étape",
      sudo: "Étape administrateur (sudo) — t écrire dans le terminal · x arrêter après cette étape",
    },
    waiting: "En attente de l'autre mise à jour — x tout arrêter",
    done: {
      select: "↑↓ choisir un paquet",
      back: "entrée retour",
      resize: (isEnlarged) => (isEnlarged ? "v réduire la sortie" : "v agrandir la sortie"),
    },
  },
});

export const RUN_NOTICES = localized({
  en: {
    quit: "Update running — x to stop it.",
    skipped: "Current package skipped.",
    skipIdle: "Nothing to interrupt right now.",
    skipAdmin: {
      uac: "The administrator step runs in its own window: it cannot be interrupted from here.",
      sudo: "The administrator step handles the whole batch at once: x to stop after it.",
    } satisfies Record<ElevationKind, string>,
    ctrlCFirst: "Current package skipped — Ctrl+C ×2 to stop all.",
    ctrlCDouble: "Stop requested — the remaining packages are cancelled.",
    stopAfterStep: "Stop requested — gup will stop after the administrator step.",
    prompt: "The program may be waiting for an answer — t to type in the terminal.",
    typeIdle: "No program running.",
    /** `t` during the UAC step: the elevated installers run in a window of their own. */
    typeElsewhere:
      "The administrator step has its own window: answer it there, nothing is typed here.",
    actionFailed: (reason: string): string => `Action failed: ${reason}`,
  },
  fr: {
    quit: "Mise à jour en cours — x pour l'arrêter.",
    skipped: "Paquet en cours ignoré.",
    skipIdle: "Rien à interrompre pour le moment.",
    skipAdmin: {
      uac:
        "L'étape administrateur se déroule dans sa propre fenêtre : " +
        "impossible de l'interrompre d'ici.",
      sudo: "L'étape administrateur traite tout le lot d'un bloc : x pour arrêter après elle.",
    },
    ctrlCFirst: "Paquet en cours ignoré — Ctrl+C ×2 pour tout arrêter.",
    ctrlCDouble: "Arrêt demandé — les paquets restants sont annulés.",
    stopAfterStep: "Arrêt demandé — gup s'arrêtera après l'étape administrateur.",
    prompt: "Le programme attend peut-être une réponse — t pour écrire dans le terminal.",
    typeIdle: "Aucun programme en cours.",
    typeElsewhere:
      "L'étape administrateur a sa propre fenêtre : répondez-y directement, rien ne se tape ici.",
    actionFailed: (reason) => `Action impossible : ${reason}`,
  },
});
