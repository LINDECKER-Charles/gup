/** A `#rrggbb` colour, lowercase. */
export type Hex = `#${string}`;

/** A terminal colour scheme: what a screenshot pretends the reader's terminal is. */
export interface TerminalPalette {
  readonly name: string;
  readonly foreground: Hex;
  readonly background: Hex;
  /** The 16 ANSI slots, 0–15. Slots 16–255 use OpenTUI's xterm-256 values. */
  readonly ansi: readonly Hex[];
  /** Window decoration drawn around the frame (not part of gup's output). */
  readonly chrome: { readonly bar: Hex; readonly edge: Hex; readonly title: Hex };
}

/**
 * GitHub Dark Default, the terminal of every screenshot: the same scheme as
 * `docs/assets/demo.svg` and GitHub's dark UI, where most readers see the
 * docs. gup paints through ANSI slots, so these are the colours a user with
 * this terminal theme really sees. The chrome title reads 5.6:1 on the bar.
 */
export const DOCS_PALETTE: TerminalPalette = {
  name: "GitHub Dark Default",
  foreground: "#e6edf3",
  background: "#0d1117",
  ansi: [
    ...["#484f58", "#ff7b72", "#3fb950", "#d29922", "#58a6ff", "#bc8cff", "#39c5cf", "#b1bac4"],
    ...["#6e7681", "#ffa198", "#56d364", "#e3b341", "#79c0ff", "#d2a8ff", "#56d4dd", "#ffffff"],
  ] as Hex[],
  chrome: { bar: "#161b22", edge: "#21262d", title: "#8b949e" },
};
