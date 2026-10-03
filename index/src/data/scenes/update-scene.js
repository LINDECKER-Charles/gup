/**
 * "Update" tab: the run view gup takes over the screen with once a batch is
 * launched — per-package status above, the installer's own output in an
 * embedded terminal pane below. French on purpose (real interface).
 *
 * Package versions and progress are illustrative sample data.
 *
 * @typedef {import("./app-scene.js").TuiScene} TuiScene
 */
import { facts } from "../facts.js";

const pkg = (name, [from, to], state) => ({ kind: "package", name, from, to, state });

/** @type {TuiScene} */
export const UPDATE_SCENE = Object.freeze({
  kind: "tui",
  lang: "fr",
  topBar: `gup ${facts.version} · Mise à jour · 1 sur 3`,
  panelTitle: "Mise à jour · 3 paquets",
  rows: [
    pkg("ripgrep", ["14.1.0", "14.1.1"], "done"),
    { ...pkg("fzf", ["0.54.0", "0.55.0"], "running"), isCursor: true },
    pkg("typescript", ["5.5.4", "5.6.2"], "queued"),
  ],
  pane: {
    title: "brew upgrade fzf",
    lines: [
      "==> Upgrading 1 outdated package:",
      "fzf 0.54.0 -> 0.55.0",
      "==> Fetching fzf",
      "==> Downloading https://ghcr.io/v2/homebrew/core/fzf/blobs/sha256:4c1e…",
    ],
    progress: 64,
  },
  hints: "s passer · x tout arrêter · t écrire dans le terminal · v agrandir",
});
