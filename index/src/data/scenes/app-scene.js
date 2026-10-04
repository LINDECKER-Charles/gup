/**
 * "Interface" tab: Paquets in the full-screen TUI, three packages checked, as
 * gup draws it in a wide terminal. The text is French on purpose — it is the
 * real interface, whatever the page language — and every label, key hint and
 * mark is the shipped one: tests/rules/scenes-truth.test.mjs holds this file
 * to the CLI's sources (src/ui/**).
 *
 * @typedef {import("./sample-machine.js").SampleGroup} SampleGroup
 *
 * @typedef {object} TuiSidebarItem
 * @property {string} label
 * @property {string} [badge]
 * @property {boolean} [isCurrent]
 * @property {boolean} [startsGroup]  Draws the blank row above the entry.
 *
 * @typedef {object} PackagesScene
 * @property {"packages"} kind
 * @property {"fr"} lang
 * @property {readonly string[]} facts  Title-bar facts after "gup v<version>".
 * @property {string} sidebarTitle
 * @property {readonly TuiSidebarItem[]} sidebar
 * @property {string} panelTitle
 * @property {{ name: string, current: string, latest: string }} columns
 * @property {readonly SampleGroup[]} groups
 * @property {string} cursor  Name of the package under the cursor.
 * @property {{ count: string, button: string }} selection  The bar under the table.
 * @property {readonly string[]} hints  Key hints in the TUI's order, global keys last.
 */
import { SAMPLE_MACHINE } from "./sample-machine.js";

const packages = SAMPLE_MACHINE.groups.flatMap((group) => group.packages);
const updates = packages.length;
const checked = packages.filter((pkg) => pkg.isChecked).length;

/** @type {PackagesScene} */
export const APP_SCENE = Object.freeze({
  kind: "packages",
  lang: "fr",
  facts: [
    `${SAMPLE_MACHINE.detected} provider(s)`,
    `${updates} mise(s) à jour`,
    "mode normal · tous les providers",
  ],
  sidebarTitle: "Menu",
  sidebar: [
    { label: "Scan" },
    { label: "Paquets", badge: String(updates), isCurrent: true },
    { label: "Planification", badge: String(SAMPLE_MACHINE.schedules) },
    { label: "Providers", startsGroup: true },
    { label: "Journal" },
    { label: "Options" },
    { label: "Quitter", startsGroup: true },
  ],
  panelTitle: "Paquets",
  columns: { name: "Paquet", current: "Actuel", latest: "Dernier" },
  groups: SAMPLE_MACHINE.groups,
  cursor: "ripgrep",
  selection: {
    count: `● ${checked} sur ${updates} coché(s)`,
    button: `Entrée  Mettre à jour (${checked})`,
  },
  hints: [
    "↑↓ naviguer",
    "espace cocher",
    "a tout cocher",
    "/ filtrer",
    `entrée mettre à jour (${checked})`,
    "r rescanner",
    "p planifier",
    "tab menu",
    "q quitter",
  ],
});
