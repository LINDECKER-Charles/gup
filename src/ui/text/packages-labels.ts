import { formatCount } from "./format.js";

/**
 * Paquets' own words (French, the language of the interface): the package
 * table, its selection bar, its key hints, and the `gup update` picker that
 * shows the same table. Tests import these constants rather than repeat them.
 */

export const PACKAGE_COLUMNS = {
  name: "Paquet",
  current: "Actuel",
  latest: "Dernier",
  note: "Note",
} as const;

export const PACKAGES_PLACEHOLDERS = {
  scanning: "scan en cours…",
  upToDate: "Tout est à jour.",
  noMatch: (filter: string) => `Aucun paquet ne correspond à « ${filter} ».`,
} as const;

const NOTHING_CHECKED = "Aucun paquet coché";
const HOW_TO_CHECK = "espace pour cocher, a pour tout cocher";
const LAUNCH = "Entrée  Mettre à jour";

/** The bar at the foot of the table: what is checked, and the button that updates it. */
export const SELECTION_BAR = {
  empty: `${NOTHING_CHECKED} — ${HOW_TO_CHECK}`,
  /**
   * `empty` cut in two where the bar is too narrow for it (about 50 columns
   * on an 80-column terminal): the state stays on the bar, how to check goes
   * on the row above it.
   */
  nothingChecked: NOTHING_CHECKED,
  howToCheck: HOW_TO_CHECK,
  count: (checked: number, total: number) =>
    `● ${formatCount(checked)} sur ${formatCount(total)} coché(s)`,
  button: (checked: number) => ` ${LAUNCH} (${formatCount(checked)}) `,
  /** `button` on a bar too narrow for it and the count: the number, already in the count, goes. */
  buttonShort: ` ${LAUNCH} `,
  /** The button's edges: what still marks it as a button without colours. */
  buttonStart: "▐",
  buttonEnd: "▌",
} as const;

/** Why Entrée (or a click on the bar) launched nothing. */
export const LAUNCH_NOTICES = {
  empty: "Cochez au moins un paquet (espace), ou tout cocher avec a.",
  scanning: "Scan en cours — la mise à jour sera possible à la fin du scan.",
} as const;

export const PACKAGES_HINTS = {
  navigate: "↑↓ naviguer",
  check: "espace cocher",
  checkAll: "a tout cocher",
  clearAll: "a tout décocher",
  filter: "/ filtrer",
  rescan: "r rescanner",
  launch: (checked: number) => `entrée mettre à jour (${formatCount(checked)})`,
  filtering: "tapez pour filtrer · entrée valider · échap effacer",
} as const;

/** The `gup update` picker: the table on its own screen. */
export const PICKER_LABELS = {
  cancelHint: "q annuler",
  answerTitle: "Paquets à mettre à jour",
  answer: (picked: number) => `${formatCount(picked)} sélectionné(s)`,
} as const;
