import type { BoxRenderable } from "@opentui/core";
import { CHROME_ROWS } from "../tui/chrome.js";
import type { Screen } from "../tui/screen-host.js";
import { panelFrame, TextPanel } from "../tui/text-panel.js";
import type { PaneSize } from "./terminal/terminal-panes.js";

/**
 * Status list balanced against the terminal pane: the list takes the rows it
 * needs, up to this share of the body (balanced); enlarged, it shrinks to its
 * header and the package in flight.
 */
const STATUS_SHARE = 0.45;
/** The terminal pane never gets fewer content rows than this. */
const MIN_TERMINAL_ROWS = 6;
/** Content rows of the status list when the terminal is enlarged: header + current row. */
const ENLARGED_STATUS_ROWS = 2;
/** Rows a bordered box loses to its border. */
const BORDER_ROWS = 2;
const BORDER_COLS = 2;

export type PaneLayout = "balanced" | "enlarged";

export interface TerminalLook {
  readonly title: string;
  /** Right-aligned on the bottom border (typing mode). */
  readonly caption?: string;
  readonly isFocused: boolean;
}

/**
 * The run view's boxes, in the chrome's body: the status list on top, the
 * terminal pane below. The pane's own box is painted with the terminal's
 * default background, never the theme's (IT-6): child programs choose their
 * colours for the user's terminal palette, and a themed background under
 * them could make their text unreadable. Only the border around it follows
 * the theme.
 */
export class RunLayout {
  readonly status: TextPanel;
  /** Where the terminal panes go. */
  readonly host: BoxRenderable;
  readonly #screen: Screen;
  readonly #root: BoxRenderable;
  readonly #frame: BoxRenderable;
  #statusRows = 0;

  constructor(screen: Screen, body: BoxRenderable) {
    const { renderer, tui } = screen;
    this.#screen = screen;
    this.#root = new tui.BoxRenderable(renderer, {
      id: "gup-run",
      flexDirection: "column",
      flexGrow: 1,
    });
    body.add(this.#root);
    this.status = new TextPanel(screen, this.#root, { id: "gup-run-status", title: "", height: 3 });
    // The list is exactly as tall as `fit` says. A panel grows by default, and
    // with no pane on screen (waiting, a result whose output was not kept) the
    // terminal frame no longer holds its share: the list would take half of
    // the free rows as blank lines, and jump as the cursor moves.
    this.status.box.flexGrow = 0;
    this.status.box.flexShrink = 0;
    this.#frame = new tui.BoxRenderable(renderer, {
      id: "gup-run-terminal",
      border: true,
      flexGrow: 1,
      flexDirection: "column",
      bottomTitleAlignment: "right",
    });
    this.host = new tui.BoxRenderable(renderer, {
      id: "gup-run-terminal-host",
      flexGrow: 1,
      flexDirection: "column",
      backgroundColor: tui.RGBA.defaultBackground(),
    });
    this.#frame.add(this.host);
    this.#root.add(this.#frame);
  }

  /**
   * Size the status list for `wantedRows` content rows; returns the rows it
   * actually got. The terminal pane takes the rest.
   */
  fit(wantedRows: number, layout: PaneLayout): number {
    const body = this.#screen.renderer.terminalHeight - CHROME_ROWS;
    const wanted = layout === "enlarged" ? ENLARGED_STATUS_ROWS : wantedRows;
    const share = layout === "enlarged" ? wanted : Math.floor(body * STATUS_SHARE) - BORDER_ROWS;
    const room = body - BORDER_ROWS - (MIN_TERMINAL_ROWS + BORDER_ROWS);
    this.#statusRows = Math.max(1, Math.min(wanted, share, room));
    this.status.setHeight(this.#statusRows + BORDER_ROWS);
    return this.#statusRows;
  }

  /** The pane size this layout gives, before OpenTUI has laid it out. */
  paneSize(): PaneSize {
    const frame = this.frame();
    if (this.host.width > 0 && this.host.height > 0) {
      return { cols: this.host.width - (frame.cols - BORDER_COLS), rows: this.host.height };
    }
    const { terminalWidth, terminalHeight } = this.#screen.renderer;
    const statusHeight = this.#statusRows + BORDER_ROWS;
    return {
      cols: terminalWidth - frame.cols,
      rows: terminalHeight - CHROME_ROWS - statusHeight - BORDER_ROWS,
    };
  }

  /** Content width of the status list. */
  statusWidth(): number {
    return Math.max(1, this.#screen.renderer.terminalWidth - this.frame().cols);
  }

  setTerminalLook(look: TerminalLook): void {
    const { appearance } = this.#screen;
    // Same inner margin as the panels; the margin keeps the terminal's colour.
    this.host.paddingX = (this.frame().cols - BORDER_COLS) / 2;
    const border = appearance.border(look.isFocused);
    this.#frame.borderStyle = border.style;
    this.#frame.borderColor = border.color;
    this.#frame.customBorderChars = border.customChars;
    this.#frame.titleColor = border.titleColor;
    this.#frame.title = look.title ? ` ${appearance.glyphs(look.title)} ` : "";
    this.#frame.bottomTitle = look.caption ? ` ${appearance.glyphs(look.caption)} ` : "";
  }

  destroy(): void {
    this.status.dispose();
    this.#root.destroyRecursively();
  }

  /** Columns and rows a panel loses to its border and inner margin, at this density. */
  private frame(): { readonly cols: number; readonly rows: number } {
    return panelFrame(this.#screen.appearance.density);
  }
}
