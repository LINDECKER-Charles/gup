/**
 * "Update" tab: the run view gup takes the screen over with once the checked
 * packages of the "Interface" tab are launched — the progress and one row per
 * package above, the installer's own output in an embedded terminal pane
 * below. French on purpose (the real interface); labels and key hints are
 * the shipped ones (tests/rules/scenes-truth.test.mjs).
 *
 * Timings and the installer output are illustrative sample data.
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
 * @typedef {object} RunScene
 * @property {"run"} kind
 * @property {"fr"} lang
 * @property {readonly string[]} facts  Title-bar facts after "gup v<version>".
 * @property {string} panelTitle
 * @property {{ done: number, total: number, success: number, skipped: number,
 *   failed: number, clock: string }} progress  The status list's first line.
 * @property {readonly RunRow[]} rows
 * @property {{ provider: string, package: string, lines: readonly string[] }} pane
 * @property {readonly string[]} hints
 */
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

/** @type {RunScene} */
export const UPDATE_SCENE = Object.freeze({
  kind: "run",
  lang: "fr",
  facts: ["Mise à jour", `${done}/${rows.length}`, ELAPSED],
  panelTitle: "Mise à jour",
  progress: {
    done,
    total: rows.length,
    success: count("success"),
    skipped: count("skipped"),
    failed: count("failed"),
    clock: ELAPSED,
  },
  rows,
  pane: {
    provider: running.provider,
    package: running.name,
    lines: [
      "==> Upgrading 1 outdated package:",
      `${running.name} ${running.from} -> ${running.to}`,
      `==> Fetching ${running.name}`,
      `==> Downloading https://ghcr.io/v2/homebrew/core/${running.name}/blobs/sha256:4c1e…`,
      "##################                                 38.2%",
    ],
  },
  hints: [
    "s passer ce paquet",
    "x tout arrêter",
    "t écrire dans le terminal",
    "v agrandir le terminal",
  ],
});
