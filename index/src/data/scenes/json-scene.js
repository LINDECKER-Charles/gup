/**
 * "JSON" tab: `gup list --json --fast`, replayed line by line.
 *
 * A line is a list of `{ t, c, b }` segments: text, a colour class from
 * styles/ui/terminal.css (mapped onto the chalk colours the CLI uses) and a
 * bold flag. Provider ids are real registry ids; there is no `apt` provider
 * (apt is only a delegation target, so it never appears as a `providerId`).
 * Versions are illustrative sample output.
 *
 * @typedef {{ t: string, c?: string, b?: boolean }} Segment
 * @typedef {{ kind: "lines", lang?: string, lines: Segment[][] }} LineScene
 */

const seg = (t, c, b) => ({ t, c, b });
const plain = (t) => [seg(t, "t-dim")];
const field = (name, value, valueClass) => [
  seg(`    "${name}"`, "t-muted"),
  seg(": ", "t-fg"),
  seg(value, valueClass),
  seg(",", "t-fg"),
];

/** @type {LineScene} */
export const JSON_SCENE = Object.freeze({
  kind: "lines",
  lines: [
    [seg("$ ", "t-green"), seg("gup list --json --fast", "t-fg", true)],
    [seg(" ")],
    [seg("[", "t-fg")],
    [seg("  {", "t-fg")],
    field("providerId", '"brew"', "t-green"),
    field("available", "true", "t-lilac"),
    [seg('    "packages"', "t-muted"), seg(": [", "t-fg")],
    plain('      { "id": "ripgrep", "current": "14.1.0", "latest": "14.1.1" },'),
    plain('      { "id": "fzf",     "current": "0.54.0", "latest": "0.55.0" }'),
    [seg("    ]", "t-fg")],
    [seg("  },", "t-fg")],
    plain('  { "providerId": "brew-cask", "available": true, "packages": [/* 4 */] },'),
    plain('  { "providerId": "npm-g",     "available": true, "packages": [/* 2 */] },'),
    plain('  { "providerId": "cargo",     "available": true, "packages": [/* 2 */] }'),
    [seg("]", "t-fg")],
    [seg(" ")],
    [seg("exit 0", "t-green")],
  ],
});
