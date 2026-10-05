import { localized } from "../../core/i18n/localized.js";
import type { OutdatedPackage } from "../../core/types.js";
import { counted } from "./format.js";

/**
 * The interactive menu's own words, in the interface's languages: sidebar,
 * title bar facts, key hints, the dialogs' controls. Views keep their strings
 * in their own `<feature>-labels.ts`; tests import these catalogs rather than
 * repeat them. Every catalog answers in the language active when it is read.
 */

export const MENU_LABELS = localized({
  en: {
    sidebarTitle: "Menu",
    quit: "Quit",
    sidebarHints: "↑↓ navigate · enter open · tab content · q quit",
    /** Appended to the focused panel's own hints, unless it takes every key (text being typed). */
    panelHintsTail: "tab menu · q quit",
    /** What Scan and Packages say when the session has not scanned yet and no scan runs. */
    noScanYet: "No scan yet — r to scan.",
    /** After an update on the plain terminal: the menu comes back on Enter. */
    backToMenu: "Press Enter to return to gup…",
  },
  fr: {
    sidebarTitle: "Menu",
    quit: "Quitter",
    sidebarHints: "↑↓ naviguer · entrée ouvrir · tab contenu · q quitter",
    panelHintsTail: "tab menu · q quitter",
    noScanYet: "Aucun scan pour l'instant — r pour scanner.",
    backToMenu: "Entrée pour revenir à gup…",
  },
});

export const VIEW_LABELS = localized({
  en: {
    scan: "Scan",
    packages: "Packages",
    providers: "Providers",
    options: "Options",
  },
  fr: {
    scan: "Scan",
    packages: "Paquets",
    providers: "Providers",
    options: "Options",
  },
});

/** Asked before quitting while a view holds changes not saved yet. */
export const QUIT_DIALOG = localized({
  en: {
    title: "Quit without saving?",
    text: (views: readonly string[]) =>
      `Some changes are not saved (${views.join(", ")}): they will be lost.`,
  },
  fr: {
    title: "Quitter sans enregistrer ?",
    text: (views) =>
      `Des modifications ne sont pas enregistrées (${views.join(", ")}) : elles seront perdues.`,
  },
});

/**
 * The hint bar while a dialog is open: its keys replace those of the screen
 * behind it. A confirmation takes `y`, `o` and `n` in every language; each
 * language names the keys its own words start with.
 */
export const DIALOG_HINTS = localized({
  en: {
    confirm: "←→ choose · y yes · n no · enter confirm · esc cancel",
    choose: "↑↓ choose · enter confirm · esc cancel",
    ask: "type · enter confirm · esc cancel",
    /** Under a text field, until a refused value puts the reason there. */
    field: "enter confirm · esc cancel",
  },
  fr: {
    confirm: "←→ choisir · o oui · n non · entrée valider · échap annuler",
    choose: "↑↓ choisir · entrée valider · échap annuler",
    ask: "tapez · entrée valider · échap annuler",
    field: "entrée valider · échap annuler",
  },
});

/**
 * A confirmation's buttons, and what the one-shot prompts (a question on its
 * own screen, outside the menu) say and leave in the scrollback.
 */
export const DIALOG_LABELS = localized({
  en: {
    yes: "Yes",
    no: "No",
    confirmTitle: "Confirm",
    answeredYes: "yes",
    answeredNo: "no",
    /** A list question asked with no choice at all: a bug of its caller. */
    noChoices: (question: string) => `select: no choice for "${question}"`,
  },
  fr: {
    yes: "Oui",
    no: "Non",
    confirmTitle: "Confirmation",
    answeredYes: "oui",
    answeredNo: "non",
    noChoices: (question) => `select: aucun choix pour « ${question} »`,
  },
});

/** The title bar's words; the functions below decide which ones show. */
const FACT_WORDS = localized({
  en: {
    detected: (count: number) => counted(count, "detected", "detected"),
    filtered: (count: number) => counted(count, "filtered", "filtered"),
    updates: (count: number) => counted(count, "update", "updates"),
    failedScans: (count: number) => counted(count, "failed scan", "failed scans"),
    upToDate: "up to date",
    fastMode: "fast mode",
    normalMode: "normal mode",
  },
  fr: {
    detected: (count) => counted(count, "détecté", "détectés"),
    filtered: (count) => counted(count, "filtré", "filtrés"),
    updates: (count) => counted(count, "mise à jour", "mises à jour"),
    failedScans: (count) => counted(count, "scan en échec", "scans en échec"),
    upToDate: "à jour",
    fastMode: "mode rapide",
    normalMode: "mode normal",
  },
});

/**
 * The providers in the title bar: how many the last scan detected on this
 * machine, then how many the filter keeps — "27 detected · 1 filtered".
 * Nothing is said of detection before the first scan.
 */
export function providerFacts(detected: number, filtered: number): string[] {
  const parts = [
    ...(detected > 0 ? [FACT_WORDS.detected(detected)] : []),
    ...(filtered > 0 ? [FACT_WORDS.filtered(filtered)] : []),
  ];
  return parts.length > 0 ? [parts.join(" · ")] : [];
}

/**
 * "12 updates", agreeing with its number like the providers beside it; "up
 * to date" only when every provider scanned: one that failed may hide updates.
 */
export function updateCountFact(count: number, failedScans = 0): string {
  if (count > 0) return FACT_WORDS.updates(count);
  return failedScans > 0 ? FACT_WORDS.failedScans(failedScans) : FACT_WORDS.upToDate;
}

export function scanModeFact(isFast: boolean): string {
  return isFast ? FACT_WORDS.fastMode : FACT_WORDS.normalMode;
}

/** "• Git  2.51.0 → 2.52.0": one package of the confirmation, alike in every language. */
function confirmedPackage(
  pkg: Pick<OutdatedPackage, "id" | "name" | "current" | "latest">,
): string {
  return `• ${pkg.name ?? pkg.id}  ${pkg.current} → ${pkg.latest}`;
}

export const CONFIRM_UPDATE = localized({
  en: {
    title: "Update",
    heading: (count: number) => `${counted(count, "package", "packages")} will be updated:`,
    item: confirmedPackage,
    more: (count: number) => `… and ${count} more`,
  },
  fr: {
    title: "Mettre à jour",
    heading: (count) => `${counted(count, "paquet va", "paquets vont")} être mis à jour :`,
    item: confirmedPackage,
    more: (count) => `… et ${count} autre(s)`,
  },
});

/** Why an interactive screen could not open, or ended early: errors of every full screen. */
export const SCREEN_ERRORS = localized({
  en: {
    loadFailed: (reason: string) => `cannot load the interactive interface (OpenTUI): ${reason}`,
    notATerminal: "this action needs an interactive terminal (stdin/stdout TTY)",
    /** Ctrl+C on a screen: the process ends with code 130, this message unseen but in a trace. */
    cancelled: "interrupted by the user",
  },
  fr: {
    loadFailed: (reason) => `impossible de charger l'interface interactive (OpenTUI) : ${reason}`,
    notATerminal: "cette action demande un terminal interactif (stdin/stdout TTY)",
    cancelled: "interrompu par l'utilisateur",
  },
});

export const TIMEOUT_DIALOG = localized({
  en: {
    title: "Timeout per install",
    text: "In seconds. An install stuck longer is skipped; 0 turns the timeout off.",
    invalid: "a number of seconds >= 0",
  },
  fr: {
    title: "Timeout par install",
    text: "En secondes. Une install bloquée au-delà est ignorée ; 0 désactive le timeout.",
    invalid: "un nombre de secondes >= 0",
  },
});
