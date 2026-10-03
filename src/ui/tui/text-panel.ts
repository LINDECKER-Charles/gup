import type { BoxRenderable, TextRenderable } from "@opentui/core";
import type { Tui } from "./load-tui.js";
import type { Screen } from "./screen-host.js";
import { toStyledText, type Line } from "./styled-lines.js";

export interface TextPanelOptions {
  readonly id: string;
  readonly title: string;
  /** Fixed width in columns; the panel takes the remaining width otherwise. */
  readonly width?: number;
}

/** Columns a panel loses to its border and padding, rows to its border. */
export const PANEL_FRAME = { cols: 4, rows: 2 } as const;

const BORDER_IDLE = 8;
const BORDER_FOCUSED = 6;

/**
 * A rounded, titled box whose content is a block of styled lines. The panel
 * draws nothing on its own: its owner renders lines for the current state
 * and pushes them with {@link show}. Clicks and wheel turns come back as a
 * row index and a step, so owners never deal with screen coordinates.
 */
export class TextPanel {
  readonly box: BoxRenderable;
  readonly #text: TextRenderable;
  readonly #tui: Tui;

  constructor(screen: Screen, parent: BoxRenderable, options: TextPanelOptions) {
    const { renderer, tui } = screen;
    this.#tui = tui;
    this.box = new tui.BoxRenderable(renderer, {
      id: options.id,
      title: ` ${options.title} `,
      border: true,
      borderStyle: "rounded",
      borderColor: tui.RGBA.fromIndex(BORDER_IDLE),
      paddingX: 1,
      flexDirection: "column",
      ...(options.width !== undefined ? { width: options.width } : { flexGrow: 1 }),
    });
    this.#text = new tui.TextRenderable(renderer, {
      id: `${options.id}-text`,
      flexGrow: 1,
      wrapMode: "none",
    });
    this.box.add(this.#text);
    parent.add(this.box);
  }

  show(lines: readonly Line[]): void {
    this.#text.content = toStyledText(this.#tui, lines);
  }

  setTitle(title: string): void {
    this.box.title = ` ${title} `;
  }

  setFocused(isFocused: boolean): void {
    this.box.borderColor = this.#tui.RGBA.fromIndex(isFocused ? BORDER_FOCUSED : BORDER_IDLE);
  }

  /** `handler(row)` with the 0-based content row that was clicked. */
  onRowClick(handler: (row: number) => void): void {
    this.#text.onMouseDown = (event) => handler(event.y - this.#text.y);
  }

  /** `handler(step)`: -1 for a wheel turn up, +1 for down. */
  onScroll(handler: (step: number) => void): void {
    this.#text.onMouseScroll = (event) => handler(event.scroll?.direction === "up" ? -1 : 1);
  }
}
