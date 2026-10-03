import type { BoxRenderable, EmbeddedTerminalRenderable } from "@opentui/core";
import type { PtyInput, PtyPane } from "../../core/pty/pty-sink.js";
import type { Screen } from "../tui/screen-host.js";
import type { PromptSample } from "./prompt-hint.js";

/**
 * Output kept per pane, in bytes (OpenTUI counts its scrollback in bytes,
 * with a page-sized floor): about 1 650 lines at 40 columns, so one pane
 * costs about 1 MB at most.
 */
const TERMINAL_SCROLLBACK_BYTES = 1_000_000;

/** Lines of the visible screen handed to the install's trace. */
const TAIL_LINES = 20;
/** gup's own lines in a pane: dimmed, behind a marker, alone on their line. */
const NOTE_START = "\x1b[2m› ";
const NOTE_END = "\x1b[0m\r\n";

export interface TerminalPaneOptions {
  readonly id: string;
  /** The package this pane shows (`providerId:packageId`), or the elevated step's key. */
  readonly key: string;
  readonly title: string;
  /** The size the child starts with until the layout says otherwise. */
  readonly size: { readonly cols: number; readonly rows: number };
  readonly clock: () => number;
}

/**
 * One package's terminal: an OpenTUI embedded terminal (a native VT emulator)
 * fed by the child's pseudo-terminal output, whose keys, pastes, terminal
 * responses and size go back to the child it is attached to.
 *
 * It only takes the keyboard while a child is attached and no dialog is open:
 * otherwise it is not focusable at all, so neither `t` nor a click can send a
 * key anywhere (IT-5). It draws with a transparent background, over the
 * terminal-coloured host the run layout gives it (IT-6).
 */
export class TerminalPane implements PtyPane {
  readonly key: string;
  readonly title: string;
  readonly #screen: Screen;
  readonly #terminal: EmbeddedTerminalRenderable;
  readonly #clock: () => number;
  #size: { cols: number; rows: number };
  #input: PtyInput | null = null;
  #isLocked = false;
  #lastOutputAt: number;
  #isAtLineStart = true;

  constructor(screen: Screen, host: BoxRenderable, options: TerminalPaneOptions) {
    const { renderer, tui } = screen;
    this.key = options.key;
    this.title = options.title;
    this.#screen = screen;
    this.#clock = options.clock;
    this.#lastOutputAt = options.clock();
    this.#size = { ...options.size };
    this.#terminal = new tui.EmbeddedTerminalRenderable(renderer, {
      id: options.id,
      // Follow the host's layout (the status list above grows and shrinks);
      // `cols`/`rows` only size the emulator until the first layout.
      width: "100%",
      height: "100%",
      cols: options.size.cols,
      rows: options.size.rows,
      maxScrollback: TERMINAL_SCROLLBACK_BYTES,
      transparentBackground: true,
      onData: (data, source) => this.forward(data, source),
      onTerminalResize: (cols, rows) => this.resized(cols, rows),
    });
    this.#terminal.focusable = false;
    host.add(this.#terminal);
  }

  size(): { readonly cols: number; readonly rows: number } {
    return this.#size;
  }

  write(data: string): void {
    this.#lastOutputAt = this.#clock();
    this.print(data);
  }

  note(line: string): void {
    const start = this.#isAtLineStart ? "" : "\r\n";
    this.print(`${start}${this.#screen.appearance.glyphs(NOTE_START + line)}${NOTE_END}`);
  }

  attach(input: PtyInput): () => void {
    this.#input = input;
    this.refreshFocusable();
    return () => {
      if (this.#input !== input) return;
      this.#input = null;
      this.refreshFocusable();
    };
  }

  tail(): string {
    return this.#terminal.screen().lines.filter(Boolean).slice(-TAIL_LINES).join("\n");
  }

  /** A child is attached: keys typed here would reach it. */
  get isAttached(): boolean {
    return this.#input !== null;
  }

  get isFocused(): boolean {
    return this.#terminal.focused;
  }

  /** Give the keyboard to the child; false when there is none, or a dialog is open. */
  focus(): boolean {
    this.#terminal.focus();
    return this.#terminal.focused;
  }

  blur(): void {
    this.#terminal.blur();
  }

  /**
   * While a dialog is open the pane gives the keyboard back and cannot take
   * it again, and what the user would type or click into it is dropped;
   * the child's own terminal queries still get their answers.
   */
  setLocked(isLocked: boolean): void {
    this.#isLocked = isLocked;
    this.refreshFocusable();
  }

  set visible(isVisible: boolean) {
    this.#terminal.visible = isVisible;
  }

  /** What tells a silent program waiting for an answer. */
  promptSample(): PromptSample {
    const screen = this.#terminal.screen();
    return {
      lastLine: screen.lines[screen.cursor.y] ?? "",
      idleMs: this.#clock() - this.#lastOutputAt,
    };
  }

  destroy(): void {
    this.#input = null;
    this.#terminal.destroyRecursively();
  }

  private print(data: string): void {
    if (data.length === 0) return;
    this.#isAtLineStart = data.endsWith("\n");
    this.#terminal.write(data);
  }

  private forward(data: Uint8Array, source: "input" | "response"): void {
    if (source === "input" && this.#isLocked) return;
    this.#input?.write(data);
  }

  private resized(cols: number, rows: number): void {
    this.#size = { cols, rows };
    this.#input?.resize(cols, rows);
  }

  /**
   * Blur before turning focus off: OpenTUI's `blur()` does nothing on a
   * renderable that is no longer focusable.
   */
  private refreshFocusable(): void {
    const isFocusable = this.#input !== null && !this.#isLocked;
    if (!isFocusable) this.blur();
    this.#terminal.focusable = isFocusable;
  }
}
