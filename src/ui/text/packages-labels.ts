import { formatCount } from "./fr-format.js";

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

/** The bar at the foot of the table: what is checked, and the button that updates it. */
export const SELECTION_BAR = {
  empty: `${NOTHING_CHECKED} — espace pour cocher, a pour tout cocher`,
  /** `empty` on a bar too narrow for it: the keys stay in the hint bar. */
  emptyShort: NOTHING_CHECKED,
  count: (checked: number, total: number) =>
    `● ${formatCount(checked)} sur ${formatCount(total)} coché(s)`,
  button: (checked: number) => ` Entrée  Mettre à jour (${formatCount(checked)}) `,
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
