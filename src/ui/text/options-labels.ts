import type { NoteColumn, PackageSort } from "../app/ui-preferences.js";
import type { ViewId } from "../app/view-definition.js";

/**
 * The Options view's words (French, the language of the interface): section
 * titles, rows, values, hints, notices and the reset dialogs. Tests import
 * these rather than repeat them.
 */

export const OPTIONS_SECTIONS = {
  scan: "SCAN & INSTALLATION",
  comfort: "CONFORT",
  file: "FICHIER",
} as const;

export const OPTION_LABELS = {
  fast: "Mode rapide",
  timeout: "Timeout install",
  filter: "Filtre providers",
  launchView: "Vue au lancement",
  scanOnLaunch: "Scanner au lancement",
  confirm: "Confirmer les MAJ",
  rescan: "Rescanner après MAJ",
  sort: "Tri des paquets",
  note: "Colonne Note",
  incompatible: "Providers incompat.",
  animations: "Animations",
  mouse: "Souris",
  notify: "Notification de fin",
  reset: "Réinitialiser…",
  file: "Fichier",
} as const;

export const OPTION_HINTS = {
  fast: "ignore les providers lents",
  timeout: "une install bloquée au-delà est ignorée",
  filter: "limiter le scan",
  launchView: "vue ouverte au démarrage",
  scanOnLaunch: "sinon, r pour scanner",
  confirm: "demander avant de lancer",
  rescan: "sinon retire les paquets à jour",
  sort: "dans chaque provider",
  note: "Auto : selon la largeur",
  incompatible: "grisés dans la vue Providers",
  animations: "indicateurs animés",
  mouse: "clic et molette",
  notify: "à la fin d'une longue MAJ",
  reset: "remettre des réglages par défaut",
} as const;

export const SWITCH_VALUES = { on: "ON", off: "OFF" } as const;

export const SORT_VALUES: Readonly<Record<PackageSort, string>> = {
  provider: "Ordre du provider",
  name: "Nom",
  bump: "Importance",
};

export const NOTE_VALUES: Readonly<Record<NoteColumn, string>> = {
  auto: "Auto",
  hidden: "Masquée",
};

export const INCOMPATIBLE_VALUES = { shown: "Affichés", hidden: "Masqués" } as const;

/** Every view gup can open on, the ones other features add included. */
export const LAUNCH_VIEW_VALUES: Readonly<Record<ViewId, string>> = {
  scan: "Scan",
  packages: "Paquets",
  schedules: "Planification",
  providers: "Providers",
  journal: "Journal",
  options: "Options",
};

export const TIMEOUT_VALUE = (seconds: number): string => (seconds > 0 ? `${seconds}s` : "OFF");
/** A number of seconds the settings file could not keep (fractional, or beyond a day). */
export const TIMEOUT_OUT_OF_RANGE = "un nombre entier de secondes, de 0 à 86400";

export const FILTER_VIEW = {
  title: "Filtre providers",
  heading: "Providers à inclure — aucun coché = tous",
  empty: "Aucun provider détecté pour l'instant — lancez un scan.",
  hints: "↑↓ naviguer · espace cocher · a tout · entrée/échap retour",
  value: (count: number) => (count === 0 ? "tous" : `${count} choisi(s)`),
} as const;

export const OPTIONS_HINTS = {
  list: "↑↓ naviguer · entrée modifier · ←→ valeur",
  rescan: "r rescanner",
  copy: "c copier le chemin",
} as const;

export const OPTIONS_NOTICES = {
  notSaved: (reason: string) => `⚠ Réglage non enregistré — ${reason}`,
  rescan: "Réglages modifiés — r pour rescanner avec ces réglages.",
  copied: "chemin copié",
  copyFailed: "copie impossible (OSC 52 non pris en charge)",
} as const;

/** What can be put back to its defaults, and what each scope covers. */
export type ResetScope = "appearance" | "comfort" | "scan" | "all";

export const RESET_DIALOG = {
  title: "Réinitialiser",
  confirm: (scope: string) => `Remettre « ${scope} » aux valeurs par défaut ?`,
  scopes: {
    appearance: { label: "Apparence", description: "thème, couleurs, symboles, densité" },
    comfort: { label: "Confort", description: "vue au lancement, confirmations, tri, souris…" },
    scan: { label: "Scan & installation", description: "mode rapide, filtre, timeout" },
    all: { label: "Tout", description: "tous les réglages de cette page" },
  } satisfies Readonly<Record<ResetScope, { label: string; description: string }>>,
} as const;
