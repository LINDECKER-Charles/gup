/**
 * "Interface" tab: the Paquets view of the full-screen TUI with a few
 * packages checked, as gup draws it. The text is French on purpose — it is
 * the real interface, whatever the page language — and the vocabulary
 * (sidebar order, key hints) is the shipped one.
 *
 * Package versions and counts are illustrative sample data.
 *
 * @typedef {object} TuiSidebarItem
 * @property {string} label
 * @property {string} [badge]
 * @property {boolean} [isCurrent]
 * @property {boolean} [startsGroup]  Draws the separator above the entry.
 *
 * @typedef {{ kind: "group", provider: string, count: number }
 *   | { kind: "package", name: string, from: string, to: string,
 *       state: "checked" | "unchecked" | "running" | "done" | "queued" | "failed",
 *       isCursor?: boolean }} TuiRow
 *
 * @typedef {object} TuiScene
 * @property {"tui"} kind
 * @property {"fr"} lang
 * @property {string} topBar
 * @property {TuiSidebarItem[]} [sidebar]  Absent for full-screen takeovers.
 * @property {string} panelTitle
 * @property {TuiRow[]} rows
 * @property {{ title: string, lines: string[], progress?: number }} [pane]
 * @property {string} hints
 */
import { facts } from "../facts.js";

const pkg = (name, [from, to], state) => ({ kind: "package", name, from, to, state });

/** @type {TuiScene} */
export const APP_SCENE = Object.freeze({
  kind: "tui",
  lang: "fr",
  topBar: `gup ${facts.version} · 47 providers · 23 mises à jour`,
  sidebar: [
    { label: "Scan" },
    { label: "Paquets", badge: "23", isCurrent: true },
    { label: "Planification" },
    { label: "Providers", startsGroup: true },
    { label: "Journal" },
    { label: "Options" },
    { label: "Quitter", startsGroup: true },
  ],
  panelTitle: "Paquets",
  rows: [
    { kind: "group", provider: "Homebrew", count: 3 },
    { ...pkg("ripgrep", ["14.1.0", "14.1.1"], "checked"), isCursor: true },
    pkg("fzf", ["0.54.0", "0.55.0"], "checked"),
    pkg("bat", ["0.24.0", "0.25.0"], "unchecked"),
    { kind: "group", provider: "npm-g", count: 2 },
    pkg("typescript", ["5.5.4", "5.6.2"], "checked"),
    pkg("pnpm", ["9.6.0", "9.12.1"], "unchecked"),
  ],
  hints: "↑↓ naviguer · espace cocher · a tout cocher · entrée mettre à jour (3) · p planifier",
});
