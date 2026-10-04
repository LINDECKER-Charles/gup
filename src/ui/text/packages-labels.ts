import { localized } from "../../core/i18n/localized.js";
import { formatCount } from "./format.js";

/**
 * Packages' own words, in the interface's languages: the package table, its
 * selection bar, its key hints, and the `gup update` picker that shows the
 * same table. Tests import these catalogs rather than repeat them.
 */

export const PACKAGE_COLUMNS = localized({
  en: {
    name: "Package",
    current: "Current",
    latest: "Latest",
    note: "Note",
  },
  fr: {
    name: "Paquet",
    current: "Actuel",
    latest: "Dernier",
    note: "Note",
  },
});

export const PACKAGES_PLACEHOLDERS = localized({
  en: {
    scanning: "scanning…",
    upToDate: "Everything is up to date.",
    noMatch: (filter: string) => `No package matches "${filter}".`,
  },
  fr: {
    scanning: "scan en cours…",
    upToDate: "Tout est à jour.",
    noMatch: (filter) => `Aucun paquet ne correspond à « ${filter} ».`,
  },
});

/** The selection bar's words in one language; {@link barIn} builds the bar's texts from them. */
interface SelectionWords {
  readonly nothingChecked: string;
  readonly howToCheck: string;
  /** The launch button's label. */
  readonly launch: string;
  /** "● 3 of 12 checked", from counts already formatted. */
  readonly count: (checked: string, total: string) => string;
}

function barIn(words: SelectionWords) {
  return {
    empty: `${words.nothingChecked} — ${words.howToCheck}`,
    /**
     * `empty` cut in two where the bar is too narrow for it (about 50 columns
     * on an 80-column terminal): the state stays on the bar, how to check goes
     * on the row above it.
     */
    nothingChecked: words.nothingChecked,
    howToCheck: words.howToCheck,
    count: (checked: number, total: number) =>
      words.count(formatCount(checked), formatCount(total)),
    button: (checked: number) => ` ${words.launch} (${formatCount(checked)}) `,
    /** `button` on a bar too narrow for it and the count: the number (in the count) goes. */
    buttonShort: ` ${words.launch} `,
    /** The button's edges: what still marks it as a button without colours. */
    buttonStart: "▐",
    buttonEnd: "▌",
  };
}

/** The bar at the foot of the table: what is checked, and the button that updates it. */
export const SELECTION_BAR = localized({
  en: barIn({
    nothingChecked: "No package checked",
    howToCheck: "space to check, a to check all",
    launch: "Enter  Update",
    count: (checked, total) => `● ${checked} of ${total} checked`,
  }),
  fr: barIn({
    nothingChecked: "Aucun paquet coché",
    howToCheck: "espace pour cocher, a pour tout cocher",
    launch: "Entrée  Mettre à jour",
    count: (checked, total) => `● ${checked} sur ${total} coché(s)`,
  }),
});

/** Why Enter (or a click on the bar) launched nothing. */
export const LAUNCH_NOTICES = localized({
  en: {
    empty: "Check at least one package (space), or check all with a.",
    scanning: "Scan in progress — you can update once it is over.",
  },
  fr: {
    empty: "Cochez au moins un paquet (espace), ou tout cocher avec a.",
    scanning: "Scan en cours — la mise à jour sera possible à la fin du scan.",
  },
});

export const PACKAGES_HINTS = localized({
  en: {
    navigate: "↑↓ navigate",
    check: "space check",
    checkAll: "a check all",
    clearAll: "a uncheck all",
    filter: "/ filter",
    rescan: "r rescan",
    launch: (checked: number) => `enter update (${formatCount(checked)})`,
    filtering: "type to filter · enter confirm · esc clear",
  },
  fr: {
    navigate: "↑↓ naviguer",
    check: "espace cocher",
    checkAll: "a tout cocher",
    clearAll: "a tout décocher",
    filter: "/ filtrer",
    rescan: "r rescanner",
    launch: (checked) => `entrée mettre à jour (${formatCount(checked)})`,
    filtering: "tapez pour filtrer · entrée valider · échap effacer",
  },
});

/** The `gup update` picker: the table on its own screen. */
export const PICKER_LABELS = localized({
  en: {
    cancelHint: "q cancel",
    answerTitle: "Packages to update",
    answer: (picked: number) => `${formatCount(picked)} selected`,
  },
  fr: {
    cancelHint: "q annuler",
    answerTitle: "Paquets à mettre à jour",
    answer: (picked) => `${formatCount(picked)} sélectionné(s)`,
  },
});
