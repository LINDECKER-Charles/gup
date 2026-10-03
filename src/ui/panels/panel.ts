import type { KeyPress } from "../tui/screen-host.js";
import type { Line } from "../tui/styled-lines.js";

/** Room a panel can draw in, inside its border. */
export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/**
 * One screen of content in the main area. A panel holds its own state,
 * renders it as lines for a given viewport, and reacts to input; it never
 * touches the terminal, which is what makes panels testable as plain objects.
 */
export interface Panel {
  readonly title: string;
  /** Key hints shown in the bottom bar while the panel has the focus. */
  hints(): string;
  render(viewport: Viewport): readonly Line[];
  press(key: KeyPress): void;
  /** A click on content row `row` (0-based) of a render at `viewport`. */
  click(row: number, viewport: Viewport): void;
  scroll(step: number): void;
  /** True while the panel takes every printable key (a filter being typed). */
  readonly isCapturingText: boolean;
  /**
   * Claim `key` before the menu's global bindings (`←` focuses the sidebar):
   * a panel stepping a value with ←/→, or holding a sub-view, says so here.
   * `q` and Tab stay global unless the panel captures text.
   */
  wantsKey?(key: KeyPress): boolean;
  /** The panel came to the front: load what it shows lazily. */
  onShow?(): void;
}

/** `pageup`/`pagedown` step: fixed, so a key does the same thing on any terminal. */
export const PAGE_STEP = 10;

/** Line shown when a panel has nothing to show yet. */
export function placeholder(text: string): Line[] {
  return [[], [{ text: `  ${text}`, tone: "muted" }]];
}
