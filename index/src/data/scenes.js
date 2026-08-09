/**
 * Terminal scenes replayed by ui/Terminal.jsx.
 *
 * A scene is a list of lines; a line is a list of `{ t, c, b }` segments where
 * `c` is a colour class from styles/terminal.css (mapped 1:1 onto the chalk
 * colours the real CLI uses) and `b` marks bold. Output is ASCII-aligned on
 * purpose — the segments keep `white-space: pre` so columns survive.
 *
 * Provider ids are the real ones from src/core/registry.ts (`brew`,
 * `brew-cask`, `npm-g`, `cargo`, `helm`, `pip`). There is no `apt` provider:
 * apt only exists as a delegation target, so it never appears as a
 * `providerId` in `gup list --json`.
 *
 * Package versions and timings are illustrative sample output.
 */
import { facts } from "./facts.js";

const seg = (t, c, b) => ({ t, c, b });
const line = (...segs) => segs;
const blank = () => [seg(" ")];

const banner = [
  line(
    seg("  gup", "t-fg", true),
    seg("  global updater", "t-dim"),
    seg(`                        v${facts.version}`, "t-dim"),
  ),
  line(
    seg(
      "  ──────────────────────────────────────────────────────",
      "t-dim",
    ),
  ),
];

export const scenes = {
  menu: {
    label: "menu",
    title: "gup",
    lines: [
      line(seg("$ ", "t-green"), seg("gup", "t-fg", true)),
      blank(),
      ...banner,
      blank(),
      line(
        seg(
          "· scan terminé en 4.2s — 47 provider(s), 23 mise(s) à jour",
          "t-dim",
        ),
      ),
      blank(),
      line(
        seg("  status   ", "t-dim"),
        seg("47 provider(s) détecté(s)  ·  ", "t-fg"),
        seg("23 mise(s) à jour", "t-amber"),
      ),
      line(seg("  mode     ", "t-dim"), seg("normal  ·  tous", "t-dim")),
      blank(),
      line(
        seg("? ", "t-green"),
        seg("Action", "t-fg", true),
        seg("  (Use arrow keys)", "t-dim"),
      ),
      line(
        seg("❯ ", "t-accent"),
        seg("Scan             ", "t-accent"),
        seg(" rescanne tous les providers", "t-dim"),
      ),
      line(
        seg("  Review           ", "t-fg"),
        seg(" voir la liste détaillée", "t-dim"),
      ),
      line(
        seg("  Update selected  ", "t-fg"),
        seg(" choix multiple", "t-dim"),
      ),
      line(seg("  Update all       ", "t-fg"), seg(" 23 paquet(s)", "t-dim")),
      line(seg("  ──", "t-dim")),
      line(
        seg("  Update target    ", "t-fg"),
        seg(" provider:package", "t-dim"),
      ),
      line(
        seg("  Providers        ", "t-fg"),
        seg(" status / install hints", "t-dim"),
      ),
      line(
        seg("  Options          ", "t-fg"),
        seg(" fast mode, filtre providers", "t-dim"),
      ),
      line(seg("  Quit", "t-fg")),
    ],
  },

  list: {
    label: "json",
    title: "gup list --json --fast",
    lines: [
      line(seg("$ ", "t-green"), seg("gup list --json --fast", "t-fg", true)),
      blank(),
      line(seg("[", "t-fg")),
      line(seg("  {", "t-fg")),
      line(
        seg('    "providerId"', "t-muted"),
        seg(": ", "t-fg"),
        seg('"brew"', "t-green"),
        seg(",", "t-fg"),
      ),
      line(
        seg('    "available"', "t-muted"),
        seg(": ", "t-fg"),
        seg("true", "t-lilac"),
        seg(",", "t-fg"),
      ),
      line(seg('    "packages"', "t-muted"), seg(": [", "t-fg")),
      line(
        seg(
          '      { "id": "ripgrep",    "current": "14.1.0", "latest": "14.1.1" },',
          "t-dim",
        ),
      ),
      line(
        seg(
          '      { "id": "fzf",        "current": "0.54.0", "latest": "0.55.0" }',
          "t-dim",
        ),
      ),
      line(seg("    ]", "t-fg")),
      line(seg("  },", "t-fg")),
      line(
        seg(
          '  { "providerId": "brew-cask", "available": true,  "packages": [/* 4 */] },',
          "t-dim",
        ),
      ),
      line(
        seg(
          '  { "providerId": "npm-g",     "available": true,  "packages": [/* 2 */] },',
          "t-dim",
        ),
      ),
      line(
        seg(
          '  { "providerId": "cargo",     "available": true,  "packages": [/* 2 */] },',
          "t-dim",
        ),
      ),
      line(
        seg(
          '  { "providerId": "helm",      "available": true,  "packages": [/* 1 */] }',
          "t-dim",
        ),
      ),
      line(seg("]", "t-fg")),
      blank(),
      line(seg("exit 0", "t-green")),
    ],
  },

  target: {
    label: "ciblé",
    title: "gup update brew:ripgrep npm-g:typescript",
    lines: [
      line(
        seg("$ ", "t-green"),
        seg("gup update brew:ripgrep npm-g:typescript", "t-fg", true),
      ),
      blank(),
      line(seg("→ Homebrew: ripgrep", "t-fg", true)),
      line(
        seg(
          "==> Downloading https://ghcr.io/v2/homebrew/core/ripgrep/…",
          "t-dim",
        ),
      ),
      line(seg("  ██████████████████████████████  100%", "t-green")),
      line(
        seg("==> Pouring ripgrep--14.1.1.arm64_sonoma.bottle.tar.gz", "t-dim"),
      ),
      line(seg("Successfully installed", "t-green")),
      blank(),
      line(seg("→ npm: typescript", "t-fg", true)),
      line(seg("changed 1 package in 1.8s", "t-dim")),
      blank(),
      line(seg("OK   2 mise(s) à jour effectuée(s)", "t-green")),
    ],
  },
};

export const SCENE_KEYS = Object.keys(scenes);
