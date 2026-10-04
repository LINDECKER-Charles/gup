/**
 * "Interface" tab: Packages in the full-screen TUI, three packages checked, as
 * gup draws it in a wide terminal — once per language its interface speaks
 * (./interface-languages.js). Every label, key hint and mark is the shipped
 * one: tests/rules/scenes-truth.test.mjs holds each variant to the CLI's
 * sources (src/ui/**) in its own language.
 *
 * @typedef {import("./interface-languages.js").InterfaceLanguage} InterfaceLanguage
 * @typedef {import("./sample-machine.js").SampleGroup} SampleGroup
 *
 * @typedef {object} TuiSidebarItem
 * @property {string} label
 * @property {string} [badge]
 * @property {boolean} [isCurrent]
 * @property {boolean} [startsGroup]  Draws the blank row above the entry.
 *
 * @typedef {object} PackagesSpoken
 *   What a screen reader says where the TUI draws a mark or leaves a heading
 *   blank, in the scene's language. The site's words, not the TUI's.
 * @property {{ checked: string, partial: string, unchecked: string }} boxes
 * @property {string} scheduled  The `∞` of a package an enabled schedule covers.
 * @property {string} boxColumn  Heading of the box column, which the TUI leaves blank.
 *
 * @typedef {object} PackagesScene
 * @property {"packages"} kind
 * @property {InterfaceLanguage} lang
 * @property {readonly string[]} facts  Title-bar facts after "gup v<version>".
 * @property {string} sidebarTitle
 * @property {readonly TuiSidebarItem[]} sidebar
 * @property {string} panelTitle
 * @property {{ name: string, current: string, latest: string }} columns
 * @property {readonly SampleGroup[]} groups
 * @property {string} cursor  Name of the package under the cursor.
 * @property {{ count: string, button: string }} selection  The bar under the table.
 * @property {readonly string[]} hints  Key hints in the TUI's order, global keys last.
 * @property {PackagesSpoken} spoken
 */
import { perLanguage } from "./interface-languages.js";
import { SAMPLE_MACHINE } from "./sample-machine.js";

const packages = SAMPLE_MACHINE.groups.flatMap((group) => group.packages);
const updates = packages.length;
const checked = packages.filter((pkg) => pkg.isChecked).length;

/** What each language writes; the screen around the words is the same in every language. */
const WORDS = {
  en: {
    facts: [`${SAMPLE_MACHINE.detected} detected`, `${updates} updates`, "normal mode"],
    sidebarTitle: "Menu",
    views: {
      scan: "Scan",
      packages: "Packages",
      schedules: "Schedules",
      providers: "Providers",
      journal: "Journal",
      options: "Options",
      quit: "Quit",
    },
    columns: { name: "Package", current: "Current", latest: "Latest" },
    selection: {
      count: `● ${checked} of ${updates} checked`,
      button: `Enter  Update (${checked})`,
    },
    hints: [
      "space check",
      "/ filter",
      "p schedule",
      "a check all",
      "↑↓ navigate",
      "r rescan",
      `enter update (${checked})`,
      "tab menu",
      "q quit",
    ],
    spoken: {
      boxes: { checked: "checked", partial: "partly checked", unchecked: "not checked" },
      scheduled: "scheduled",
      boxColumn: "Selection",
    },
  },
  fr: {
    facts: [`${SAMPLE_MACHINE.detected} détectés`, `${updates} mises à jour`, "mode normal"],
    sidebarTitle: "Menu",
    views: {
      scan: "Scan",
      packages: "Paquets",
      schedules: "Planification",
      providers: "Providers",
      journal: "Journal",
      options: "Options",
      quit: "Quitter",
    },
    columns: { name: "Paquet", current: "Actuel", latest: "Dernier" },
    selection: {
      count: `● ${checked} sur ${updates} coché(s)`,
      button: `Entrée  Mettre à jour (${checked})`,
    },
    hints: [
      "espace cocher",
      "/ filtrer",
      "p planifier",
      "a tout cocher",
      "↑↓ naviguer",
      "r rescanner",
      `entrée mettre à jour (${checked})`,
      "tab menu",
      "q quitter",
    ],
    spoken: {
      boxes: { checked: "coché", partial: "en partie coché", unchecked: "non coché" },
      scheduled: "planifié",
      boxColumn: "Sélection",
    },
  },
};

/**
 * @param {InterfaceLanguage} lang
 * @returns {PackagesScene}
 */
function packagesScene(lang) {
  const { views, ...words } = WORDS[lang];
  return Object.freeze({
    kind: "packages",
    lang,
    facts: words.facts,
    sidebarTitle: words.sidebarTitle,
    sidebar: [
      { label: views.scan },
      { label: views.packages, badge: String(updates), isCurrent: true },
      { label: views.schedules, badge: String(SAMPLE_MACHINE.schedules) },
      { label: views.providers, startsGroup: true },
      { label: views.journal },
      { label: views.options },
      { label: views.quit, startsGroup: true },
    ],
    panelTitle: views.packages,
    columns: words.columns,
    groups: SAMPLE_MACHINE.groups,
    cursor: "ripgrep",
    selection: words.selection,
    hints: words.hints,
    spoken: words.spoken,
  });
}

export const APP_SCENES = perLanguage(packagesScene);
