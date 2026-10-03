import type { BoxRenderable, TextRenderable } from "@opentui/core";
import type { Density } from "../theme/appearance.js";
import type { Screen } from "./screen-host.js";
import { toStyledText, type Line } from "./styled-lines.js";

export interface TextPanelOptions {
  readonly id: string;
  readonly title: string;
  /** Fixed width in columns; the panel takes the remaining width otherwise. */
  readonly width?: number;
  /** Fixed height in rows; the panel takes the remaining height otherwise. */
  readonly height?: number;
}

const BORDER_COLS = 2;
const BORDER_ROWS = 2;
const PADDING_X: Readonly<Record<Density, number>> = { comfortable: 1, compact: 0 };

/** Columns a panel loses to its border and padding, rows to its border. */
export function panelFrame(density: Density): { readonly cols: number; readonly rows: number } {
  return { cols: BORDER_COLS + 2 * PADDING_X[density], rows: BORDER_ROWS };
}

/**
 * A titled box whose content is a block of styled lines. The panel draws
 * nothing on its own: its owner renders lines for the current state and
 * pushes them with {@link show}. Clicks and wheel turns come back as a row
 * index and a step, so owners never deal with screen coordinates. Border,
 * title and padding follow the screen's appearance, focus included.
 */
export class TextPanel {
  readonly box: BoxRenderable;
  readonly #text: TextRenderable;
  readonly #screen: Screen;
  #title: string;
  #isFocused = false;

  constructor(screen: Screen, parent: BoxRenderable, options: TextPanelOptions) {
    const { renderer, tui } = screen;
    this.#screen = screen;
    this.#title = options.title;
    this.box = new tui.BoxRenderable(renderer, {
      id: options.id,
      border: true,
      flexDirection: "column",
      ...(options.width !== undefined ? { width: options.width } : { flexGrow: 1 }),
      ...(options.height !== undefined && { height: options.height }),
    });
    this.#text = new tui.TextRenderable(renderer, {
      id: `${options.id}-text`,
      flexGrow: 1,
      wrapMode: "none",
    });
    this.box.add(this.#text);
    parent.add(this.box);
    this.applyLook();
    screen.appearance.onChange(() => this.applyLook());
  }

  show(lines: readonly Line[]): void {
    this.#text.content = toStyledText(this.#screen, lines);
  }

  setTitle(title: string): void {
    this.#title = title;
    this.box.title = ` ${this.#screen.appearance.glyphs(title)} `;
  }

  setFocused(isFocused: boolean): void {
    this.#isFocused = isFocused;
    this.applyLook();
  }

  setHeight(rows: number): void {
    this.box.height = rows;
  }

  /** `handler(row)` with the 0-based content row that was clicked. */
  onRowClick(handler: (row: number) => void): void {
    this.#text.onMouseDown = (event) => handler(event.y - this.#text.y);
  }

  /** `handler(step)`: -1 for a wheel turn up, +1 for down. */
  onScroll(handler: (step: number) => void): void {
    this.#text.onMouseScroll = (event) => handler(event.scroll?.direction === "up" ? -1 : 1);
  }

  private applyLook(): void {
    const { appearance } = this.#screen;
    const look = appearance.border(this.#isFocused);
    this.box.borderStyle = look.style;
    this.box.borderColor = look.color;
    this.box.customBorderChars = look.customChars;
    this.box.titleColor = look.titleColor;
    this.box.paddingX = PADDING_X[appearance.density];
    this.setTitle(this.#title);
  }
}
