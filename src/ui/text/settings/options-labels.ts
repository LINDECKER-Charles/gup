import { localized } from "../../../core/i18n/localized.js";
import type { NoteColumn, PackageSort } from "../../app/ui-preferences.js";
import type { ViewId } from "../../app/view-definition.js";
import type { Density } from "../../theme/appearance.js";
import { STATUS_GLYPHS, type GlyphPreference } from "../../theme/glyphs.js";

/**
 * The Options view's words, in the interface's languages: section titles,
 * rows, values, hints, notices and the reset dialogs. Theme words live in
 * `theme-labels.ts`. Tests import these rather than repeat them.
 */

export const OPTIONS_SECTIONS = localized({
  en: {
    scan: "SCAN & INSTALL",
    appearance: "APPEARANCE",
    comfort: "BEHAVIOR",
    file: "FILE",
  },
  fr: {
    scan: "SCAN & INSTALLATION",
    appearance: "APPARENCE",
    comfort: "CONFORT",
    file: "FICHIER",
  },
});

export const OPTION_LABELS = localized({
  en: {
    fast: "Fast mode",
    timeout: "Install timeout",
    filter: "Provider filter",
    theme: "Theme",
    colors: "Custom colors",
    contrast: "Contrast level",
    glyphs: "Symbols",
    density: "Density",
    launchView: "Startup view",
    scanOnLaunch: "Scan at startup",
    confirm: "Confirm updates",
    rescan: "Rescan after updates",
    sort: "Package sort",
    note: "Note column",
    incompatible: "Incompatible providers",
    animations: "Animations",
    mouse: "Mouse",
    notify: "Notify when done",
    reset: "Reset…",
    file: "File",
  },
  fr: {
    fast: "Mode rapide",
    timeout: "Timeout install",
    filter: "Filtre providers",
    theme: "Thème",
    colors: "Couleurs perso.",
    contrast: "Niveau de contraste",
    glyphs: "Symboles",
    density: "Densité",
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
  },
});

export const OPTION_HINTS = localized({
  en: {
    fast: "skips the slow providers",
    timeout: "an install stuck longer is skipped",
    filter: "limit the scan",
    contrast: "AA 4.5:1 · AAA 7:1",
    glyphs: "ASCII if □ or ? show up",
    density: "Compact: more rows",
    launchView: "the view gup opens on",
    scanOnLaunch: "otherwise, r to scan",
    confirm: "ask before starting",
    rescan: "otherwise drops up-to-date packages",
    sort: "within each provider",
    note: "Auto: by width",
    incompatible: "grayed out in the Providers view",
    animations: "animated indicators",
    mouse: "click and wheel",
    notify: "at the end of a long update",
    reset: "restore default settings",
  },
  fr: {
    fast: "ignore les providers lents",
    timeout: "une install bloquée au-delà est ignorée",
    filter: "limiter le scan",
    contrast: "AA 4,5:1 · AAA 7:1",
    glyphs: "ASCII si des □ ou des ? s'affichent",
    density: "Compacte : plus de lignes",
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
  },
});

/** The same words in every language gup speaks. */
export const SWITCH_VALUES = { on: "ON", off: "OFF" } as const;

/** The same words in every language gup speaks. */
export const GLYPH_VALUES: Readonly<Record<GlyphPreference, string>> = {
  auto: "Auto",
  unicode: "Unicode",
  ascii: "ASCII",
};

export const DENSITY_VALUES = localized<Readonly<Record<Density, string>>>({
  en: { comfortable: "Comfortable", compact: "Compact" },
  fr: { comfortable: "Confortable", compact: "Compacte" },
});

export const SORT_VALUES = localized<Readonly<Record<PackageSort, string>>>({
  en: { provider: "Provider order", name: "Name", bump: "Version jump" },
  fr: { provider: "Ordre du provider", name: "Nom", bump: "Importance" },
});

export const NOTE_VALUES = localized<Readonly<Record<NoteColumn, string>>>({
  en: { auto: "Auto", hidden: "Hidden" },
  fr: { auto: "Auto", hidden: "Masquée" },
});

export const INCOMPATIBLE_VALUES = localized({
  en: { shown: "Shown", hidden: "Hidden" },
  fr: { shown: "Affichés", hidden: "Masqués" },
});

/** Every view gup can open on, the ones other features add included. */
export const LAUNCH_VIEW_VALUES = localized<Readonly<Record<ViewId, string>>>({
  en: {
    scan: "Scan",
    packages: "Packages",
    schedules: "Schedules",
    providers: "Providers",
    journal: "Journal",
    options: "Options",
  },
  fr: {
    scan: "Scan",
    packages: "Paquets",
    schedules: "Planification",
    providers: "Providers",
    journal: "Journal",
    options: "Options",
  },
});

export const TIMEOUT_VALUE = (seconds: number): string => (seconds > 0 ? `${seconds}s` : "OFF");

/** Why the timeout dialog refuses a number the file could not keep: fractional, or over a day. */
export const TIMEOUT_LABELS = localized({
  en: { outOfRange: "a whole number of seconds, from 0 to 86400" },
  fr: { outOfRange: "un nombre entier de secondes, de 0 à 86400" },
});

const COLORS_COUNT = localized({
  en: { none: "none", changed: (count: number) => `${count} changed` },
  fr: { none: "aucune", changed: (count) => `${count} modifiée(s)` },
});

export const COLORS_VALUE = (count: number): string =>
  count === 0 ? COLORS_COUNT.none : COLORS_COUNT.changed(count);

export const FILTER_VIEW = localized({
  en: {
    title: "Provider filter",
    heading: "Providers to include — none checked = all",
    empty: "No provider detected yet — run a scan.",
    hints: "↑↓ navigate · space check · a all · enter/esc back",
    value: (count: number) => (count === 0 ? "all" : `${count} chosen`),
  },
  fr: {
    title: "Filtre providers",
    heading: "Providers à inclure — aucun coché = tous",
    empty: "Aucun provider détecté pour l'instant — lancez un scan.",
    hints: "↑↓ naviguer · espace cocher · a tout · entrée/échap retour",
    value: (count) => (count === 0 ? "tous" : `${count} choisi(s)`),
  },
});

export const OPTIONS_HINTS = localized({
  en: {
    list: "↑↓ navigate · enter change · ←→ value",
    rescan: "r rescan",
    copy: "c copy path",
  },
  fr: {
    list: "↑↓ naviguer · entrée modifier · ←→ valeur",
    rescan: "r rescanner",
    copy: "c copier le chemin",
  },
});

export const OPTIONS_NOTICES = localized({
  en: {
    notSaved: (reason: string) => `${STATUS_GLYPHS.warning} Setting not saved — ${reason}`,
    rescan: "Settings changed — r to rescan with these settings.",
    copied: "Path copied.",
    copyFailed: "Cannot copy: this terminal does not support OSC 52.",
  },
  fr: {
    notSaved: (reason) => `${STATUS_GLYPHS.warning} Réglage non enregistré — ${reason}`,
    rescan: "Réglages modifiés — r pour rescanner avec ces réglages.",
    copied: "Chemin copié.",
    copyFailed: "Copie impossible : ce terminal ne prend pas en charge OSC 52.",
  },
});

/** What can be put back to its defaults, and what each scope covers. */
export type ResetScope = "appearance" | "comfort" | "scan" | "all";

export const RESET_DIALOG = localized({
  en: {
    title: "Reset",
    confirm: (scope: string) => `Reset "${scope}" to its defaults?`,
    scopes: {
      appearance: { label: "Appearance", description: "theme, colors, symbols, density" },
      comfort: { label: "Behavior", description: "startup view, confirmations, sort, mouse…" },
      scan: { label: "Scan & install", description: "fast mode, filter, timeout" },
      all: { label: "All", description: "every setting on this page" },
    } satisfies Readonly<Record<ResetScope, { label: string; description: string }>>,
  },
  fr: {
    title: "Réinitialiser",
    confirm: (scope) => `Remettre « ${scope} » aux valeurs par défaut ?`,
    scopes: {
      appearance: { label: "Apparence", description: "thème, couleurs, symboles, densité" },
      comfort: { label: "Confort", description: "vue au lancement, confirmations, tri, souris…" },
      scan: { label: "Scan & installation", description: "mode rapide, filtre, timeout" },
      all: { label: "Tout", description: "tous les réglages de cette page" },
    },
  },
});
