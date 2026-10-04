/**
 * "Update" tab: the run view gup takes the screen over with once the checked
 * packages of the "Interface" tab are launched — the progress and one row per
 * package above, the installer's own output in an embedded terminal pane
 * below — once per language its interface speaks (./interface-languages.js).
 * Labels and key hints are the shipped ones, each variant in its own language
 * (tests/rules/scenes-truth.test.mjs).
 *
 * Timings and the installer output are illustrative sample data.
 *
 * @typedef {import("./interface-languages.js").InterfaceLanguage} InterfaceLanguage
 *
 * @typedef {"success" | "failed" | "skipped" | "cancelled" | "pending" | "running"} RunStatus
 *   Keys of the TUI's STATUS_GLYPHS.
 *
 * @typedef {object} RunRow
 * @property {string} name
 * @property {string} provider  Display name, as the run view's provider column shows it.
 * @property {string} from
 * @property {string} to
 * @property {RunStatus} status
 * @property {string} [clock]  How long it took, or has been running.
 *
 * @typedef {object} RunSpoken
 *   What a screen reader says for the status marks and the columns the run
 *   view draws without headings, in the scene's language: the site's words,
 *   the TUI's own where it has some (RUN_SUMMARY's outcomes).
 * @property {Readonly<Record<RunStatus, string>>} statuses
 * @property {readonly string[]} columns
 *
 * @typedef {object} RunScene
 * @property {"run"} kind
 * @property {InterfaceLanguage} lang
 * @property {readonly string[]} facts  Title-bar facts after "gup v<version>".
 * @property {string} panelTitle
 * @property {{ done: number, total: number, success: number, skipped: number,
 *   failed: number, clock: string }} progress  The status list's first line.
 * @property {readonly RunRow[]} rows
 * @property {{ provider: string, package: string, lines: readonly string[] }} pane
 * @property {readonly string[]} hints
 * @property {RunSpoken} spoken
 */
import { perLanguage } from "./interface-languages.js";
import { SAMPLE_MACHINE } from "./sample-machine.js";

/** Where the run stands, package by package, in the order it takes them. */
const PROGRESS = [
  { status: "success", clock: "00:04" },
  { status: "running", clock: "00:09" },
  { status: "pending" },
];
const ELAPSED = "00:13";

/** The checked packages of the "Interface" tab, in list order. */
const launched = SAMPLE_MACHINE.groups.flatMap(({ provider, packages }) =>
  packages
    .filter((pkg) => pkg.isChecked)
    .map(({ name, from, to }) => ({ name, provider, from, to })),
);
/** @type {readonly RunRow[]} */
const rows = launched.map((row, index) => ({ ...row, ...PROGRESS[index] }));

const count = (status) => rows.filter((row) => row.status === status).length;
const done = count("success") + count("failed") + count("skipped") + count("cancelled");
const running = rows.find((row) => row.status === "running");

const progress = {
  done,
  total: rows.length,
  success: count("success"),
  skipped: count("skipped"),
  failed: count("failed"),
  clock: ELAPSED,
};

/** The installer's own output: the same in every language. */
const pane = {
  provider: running.provider,
  package: running.name,
  lines: [
    "==> Upgrading 1 outdated package:",
    `${running.name} ${running.from} -> ${running.to}`,
    `==> Fetching ${running.name}`,
    `==> Downloading https://ghcr.io/v2/homebrew/core/${running.name}/blobs/sha256:4c1e…`,
    "##################                                 38.2%",
  ],
};

/**
 * What each language writes. The title-bar fact and the panel title are two
 * texts of the TUI that happen to be the same word.
 */
const WORDS = {
  en: {
    fact: "Update",
    title: "Update",
    hints: [
      "s skip this package",
      "x stop all",
      "t type in the terminal",
      "v enlarge the terminal",
    ],
    spoken: {
      statuses: {
        success: "updated",
        failed: "failed",
        skipped: "skipped",
        cancelled: "cancelled",
        pending: "pending",
        running: "running",
      },
      columns: ["Status", "Package", "Provider", "Versions", "Duration"],
    },
  },
  fr: {
    fact: "Mise à jour",
    title: "Mise à jour",
    hints: [
      "s passer ce paquet",
      "x tout arrêter",
      "t écrire dans le terminal",
      "v agrandir le terminal",
    ],
    spoken: {
      statuses: {
        success: "mis à jour",
        failed: "échec",
        skipped: "ignorée",
        cancelled: "annulée",
        pending: "en attente",
        running: "en cours",
      },
      columns: ["État", "Paquet", "Provider", "Versions", "Durée"],
    },
  },
};

/**
 * @param {InterfaceLanguage} lang
 * @returns {RunScene}
 */
function runScene(lang) {
  const words = WORDS[lang];
  return Object.freeze({
    kind: "run",
    lang,
    facts: [words.fact, `${done}/${rows.length}`, ELAPSED],
    panelTitle: words.title,
    progress,
    rows,
    pane,
    hints: words.hints,
    spoken: words.spoken,
  });
}

export const UPDATE_SCENES = perLanguage(runScene);
