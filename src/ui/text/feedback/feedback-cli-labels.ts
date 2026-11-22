import type { ErasureOutcome, SharingState } from "../../../core/feedback/sharing-state.js";
import { localized } from "../../../core/i18n/localized.js";

/**
 * The words of `gup feedback` and its subcommands, of its `gup doctor` line,
 * and of the outcomes the menu's sharing row reports too.
 */
export const FEEDBACK_CLI_LABELS = localized({
  en: {
    commandDescription:
      "Report a bug or suggest an idea: shows the install ID and opens the feedback form",
    noOpen: "Print the form's address without opening the browser",
    idDescription: "Prints this install's ID, nothing else",
    shareDescription: "Shares your journals with the maintainer, or stops: on | off",
    shareArgument: "on or off",
    statusDescription:
      "Shows whether your journals are shared, the install ID, the last upload " +
      "and the next sync",
    installId: (id: string) => `Install ID: ${id}`,
    form: (url: string) => `Feedback form: ${url}`,
    idHint: "Quote the install ID in a report: it links it to the journals you share.",
    openFailed: "The browser could not be opened: open the address above.",
    noIdentity: "no install ID: gup has no readable folder for its state on this machine",
    idNotCreated: "Install ID: not created yet (gup feedback id creates it)",
    overrideRejected: (name: string) =>
      `${name} is not an address gup accepts (https, or http on this machine): ` +
      "what it points to is off for this run.",
    unknownChoice: (value: string) => `unknown choice "${value}": choose on or off`,
    saveFailed: (reason: string) => `the choice could not be saved: ${reason}`,
    sharedOn:
      "Your journals are shared: they go out about once a week, after an update, a list " +
      "or a menu session, and when you open the feedback form.",
    forcedOffWarning: "GUP_SHARE_LOGS turns sharing off in this shell: nothing is sent here.",
    erasure: {
      erased: "Sharing is off; what this install shared was erased from the service.",
      "nothing-shared": "Sharing is off.",
      failed: "Sharing is off, but the service could not be reached to erase what was shared: " +
        "run gup feedback share off again later.",
    } as Readonly<Record<ErasureOutcome, string>>,
    status: (state: string) => `Sharing: ${state}`,
    lastUpload: (when: string) => `Last upload: ${when}`,
    neverUploaded: "Last upload: none yet",
    nextSync: (when: string) => `Next sync: from ${when}`,
    nextSyncNow: "Next sync: at the next run",
    states: {
      ask: "not asked yet",
      granted: "on",
      denied: "off",
      "forced-off": "off (GUP_SHARE_LOGS)",
    } as Readonly<Record<SharingState, string>>,
    diagnosticLabel: "Feedback",
    diagnosticValue: (state: string, installId: string) =>
      `journal sharing ${state} · install ${installId}`,
    diagnosticNoId: (state: string) => `journal sharing ${state} · install ID not created yet`,
  },
  fr: {
    commandDescription:
      "Signaler un bug ou proposer une idée : affiche l'ID d'installation et ouvre le formulaire",
    noOpen: "Affiche l'adresse du formulaire sans ouvrir le navigateur",
    idDescription: "Affiche l'ID de cette installation, rien d'autre",
    shareDescription: "Partage vos journaux avec le mainteneur, ou arrête : on | off",
    shareArgument: "on ou off",
    statusDescription:
      "Indique si vos journaux sont partagés, l'ID d'installation, le dernier " +
      "et le prochain envoi",
    installId: (id) => `ID d'installation : ${id}`,
    form: (url) => `Formulaire : ${url}`,
    idHint: "Citez l'ID d'installation dans un signalement : il le relie aux journaux partagés.",
    openFailed: "Le navigateur n'a pas pu être ouvert : ouvrez l'adresse ci-dessus.",
    noIdentity: "pas d'ID d'installation : gup n'a aucun dossier d'état lisible sur cette machine",
    idNotCreated: "ID d'installation : pas encore créé (gup feedback id le crée)",
    overrideRejected: (name) =>
      `${name} n'est pas une adresse que gup accepte (https, ou http sur cette machine) : ` +
      "ce qu'elle désigne est désactivé pour cette exécution.",
    unknownChoice: (value) => `choix inconnu « ${value} » : choisir on ou off`,
    saveFailed: (reason) => `le choix n'a pas pu être enregistré : ${reason}`,
    sharedOn:
      "Vos journaux sont partagés : ils partent environ une fois par semaine, après une " +
      "mise à jour, une liste ou une session du menu, et quand vous ouvrez le formulaire.",
    forcedOffWarning: "GUP_SHARE_LOGS désactive le partage dans ce shell : rien n'est envoyé ici.",
    erasure: {
      erased:
        "Partage désactivé ; ce que cette installation avait partagé a été effacé du service.",
      "nothing-shared": "Partage désactivé.",
      failed: "Partage désactivé, mais le service est injoignable pour effacer ce qui a été " +
        "partagé : relancez gup feedback share off plus tard.",
    },
    status: (state) => `Partage : ${state}`,
    lastUpload: (when) => `Dernier envoi : ${when}`,
    neverUploaded: "Dernier envoi : aucun pour l'instant",
    nextSync: (when) => `Prochain envoi : à partir du ${when}`,
    nextSyncNow: "Prochain envoi : à la prochaine exécution",
    states: {
      ask: "pas encore demandé",
      granted: "activé",
      denied: "désactivé",
      "forced-off": "désactivé (GUP_SHARE_LOGS)",
    },
    diagnosticLabel: "Retours",
    diagnosticValue: (state, installId) =>
      `partage des journaux ${state} · installation ${installId}`,
    diagnosticNoId: (state) => `partage des journaux ${state} · ID d'installation pas encore créé`,
  },
});
