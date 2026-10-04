import type { BoxRenderable, TextRenderable } from "@opentui/core";
import { DIALOG_HINTS } from "../text/menu-labels.js";
import type { KeyPress, Screen } from "./screen-host.js";
import { fillLine, seg, toStyledText, wrap, type Line } from "./styled-lines.js";

export interface DialogChoice<T> {
  readonly label: string;
  readonly value: T;
  /** Shown under the list while this choice is highlighted. */
  readonly description?: string;
}

interface DialogBase {
  readonly title: string;
  /** Lines above the controls, each wrapped to the dialog width; "" for a blank line. */
  readonly text?: readonly string[];
}

export interface ConfirmSpec extends DialogBase {
  readonly default?: boolean;
}

export interface ChoiceSpec<T> extends DialogBase {
  readonly choices: readonly DialogChoice<T>[];
  readonly default?: T;
}

export interface InputSpec extends DialogBase {
  readonly default?: string;
  /** `true` to accept, or the message explaining why the value is refused. */
  readonly validate?: (value: string) => true | string;
}

const MAX_WIDTH = 76;

/** The dialog on top: the keys it reacts to, and how the hint bar names them. */
interface ActiveDialog {
  press(key: KeyPress): void;
  readonly hints: string;
}

/**
 * Modal boxes drawn over whatever the screen shows: a confirmation, a choice
 * in a list, a line of text. While one is open its owner routes every key
 * to {@link press} and shows {@link hints} in place of its own; Escape
 * closes it with "no answer" (`false` for a confirmation, `undefined`
 * otherwise).
 */
export class DialogLayer {
  readonly #screen: Screen;
  readonly #listeners = new Set<() => void>();
  #active: ActiveDialog | null = null;

  constructor(screen: Screen) {
    this.#screen = screen;
  }

  get isOpen(): boolean {
    return this.#active !== null;
  }

  /** The open dialog's keys for the hint bar; empty when none is open. */
  hints(): string {
    return this.#active?.hints ?? "";
  }

  /**
   * `listener` runs right after a dialog opens and right after it closes —
   * also when that happens outside a key (a dialog a promise opened), so the
   * owner can redraw its hint bar at once. Returns the unsubscribe.
   */
  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  }

  press(key: KeyPress): void {
    this.#active?.press(key);
  }

  confirm(spec: ConfirmSpec): Promise<boolean> {
    let isYes = spec.default ?? true;
    const buttons = (): Line => [
      seg("   "),
      ...button("Oui", isYes),
      seg("   "),
      ...button("Non", !isYes),
    ];
    return this.open(spec, DIALOG_HINTS.confirm, (draw, done) => {
      draw([buttons()]);
      return (key) => {
        if (key.name === "o" || key.name === "y") done(true);
        else if (key.name === "n" || key.name === "escape") done(false);
        else if (key.name === "return" || key.name === "enter") done(isYes);
        else if (["left", "right", "tab", "h", "l"].includes(key.name)) {
          isYes = !isYes;
          draw([buttons()]);
        }
      };
    });
  }

  choose<T>(spec: ChoiceSpec<T>): Promise<T | undefined> {
    let index = Math.max(
      0,
      spec.choices.findIndex((c) => c.value === spec.default),
    );
    return this.open<T | undefined>(spec, DIALOG_HINTS.choose, (draw, done) => {
      const redraw = (): void => draw(this.choiceLines(spec.choices, index));
      redraw();
      return (key) => {
        if (key.name === "escape") return done(undefined);
        if (key.name === "return" || key.name === "enter") return done(spec.choices[index]?.value);
        if (key.name === "up" || key.name === "k") index = Math.max(0, index - 1);
        if (key.name === "down" || key.name === "j")
          index = Math.min(spec.choices.length - 1, index + 1);
        redraw();
      };
    });
  }

  ask(spec: InputSpec): Promise<string | undefined> {
    return this.open<string | undefined>(spec, DIALOG_HINTS.ask, (draw, done, box) => {
      const { renderer, tui } = this.#screen;
      const field = new tui.InputRenderable(renderer, {
        id: "gup-dialog-input",
        value: spec.default ?? "",
        ...this.inputColors(),
      });
      const hint = new tui.TextRenderable(renderer, { id: "gup-dialog-hint", wrapMode: "none" });
      const say = (line: Line): void => void (hint.content = toStyledText(this.#screen, [line]));
      box.add(field);
      box.add(hint);
      say([seg(DIALOG_HINTS.field, "muted")]);
      draw([]);
      // Focus on the next turn: the key that opened the dialog (Enter, usually)
      // is still being dispatched, and would otherwise land in the field and
      // submit it empty.
      setTimeout(() => field.focus(), 0);
      field.on(tui.InputRenderableEvents.ENTER, () => {
        const value = field.value.trim();
        const verdict = spec.validate?.(value) ?? true;
        if (verdict === true) done(value);
        else say([seg(verdict, "danger")]);
      });
      return (key) => {
        if (key.name === "escape") done(undefined);
      };
    });
  }

  private choiceLines<T>(choices: readonly DialogChoice<T>[], index: number): Line[] {
    const width = this.width() - 4;
    const rows = choices.map((choice, i): Line => {
      const row: Line = [seg(i === index ? "› " : "  ", "accent"), seg(choice.label)];
      return i === index ? fillLine(row, width, "highlight") : row;
    });
    const description = choices[index]?.description;
    if (!description) return rows;
    return [...rows, [], ...wrap(description, width).map((t): Line => [seg(t, "muted")])];
  }

  private width(): number {
    return Math.min(MAX_WIDTH, this.#screen.renderer.terminalWidth - 4);
  }

  /**
   * Draw the box, hand `setup` a way to redraw the controls and to finish,
   * and remove the box once it finishes. `setup` returns the key handler;
   * `hints` names its keys.
   */
  private open<T>(
    spec: DialogBase,
    hints: string,
    setup: (
      draw: (controls: readonly Line[]) => void,
      done: (value: T) => void,
      box: BoxRenderable,
    ) => (key: KeyPress) => void,
  ): Promise<T> {
    const { box, body } = this.createBox(spec.title);
    const lines = (spec.text ?? []).flatMap((p) => (p === "" ? [""] : wrap(p, this.width() - 4)));
    const text = lines.length > 0 ? [...lines, ""] : [];
    return new Promise<T>((resolve) => {
      const draw = (controls: readonly Line[]): void => {
        body.content = toStyledText(this.#screen, [
          ...text.map((t): Line => [seg(t)]),
          ...controls,
        ]);
        // Every child after the body (an input field, its hint) is one row high.
        this.place(box, text.length + controls.length + box.getChildren().length - 1);
      };
      const done = (value: T): void => {
        this.close(box);
        resolve(value);
      };
      this.#active = { press: setup(draw, done, box), hints };
      this.notifyChange();
    });
  }

  /** Take the dialog off the screen: the layer is free for the next one. */
  private close(box: BoxRenderable): void {
    this.#active = null;
    this.#screen.renderer.root.remove(box);
    box.destroyRecursively();
    this.notifyChange();
  }

  private notifyChange(): void {
    for (const listener of this.#listeners) listener();
  }

  /**
   * Dialogs keep a double border, coloured like a focused panel. Their box
   * must hide what is under it: on a screen that leaves the terminal's own
   * background, it is filled with the terminal's default background.
   */
  private createBox(title: string): { box: BoxRenderable; body: TextRenderable } {
    const { renderer, tui, appearance } = this.#screen;
    const look = appearance.border(true);
    const background = appearance.background();
    const box = new tui.BoxRenderable(renderer, {
      id: "gup-dialog",
      position: "absolute",
      zIndex: 100,
      title: ` ${appearance.glyphs(title)} `,
      border: true,
      borderStyle: "double",
      borderColor: look.color,
      ...(look.customChars && { customBorderChars: look.customChars }),
      ...(look.titleColor && { titleColor: look.titleColor }),
      backgroundColor: background === "transparent" ? tui.RGBA.defaultBackground() : background,
      shouldFill: true,
      paddingX: 1,
      flexDirection: "column",
    });
    const body = new tui.TextRenderable(renderer, { id: "gup-dialog-body", wrapMode: "none" });
    box.add(body);
    renderer.root.add(box);
    return { box, body };
  }

  /** The text field painted like the rest of the screen. */
  private inputColors() {
    const look = this.#screen.appearance.input();
    return {
      textColor: look.textColor,
      focusedTextColor: look.textColor,
      backgroundColor: look.backgroundColor,
      focusedBackgroundColor: look.backgroundColor,
      placeholderColor: look.placeholderColor,
      cursorColor: look.cursorColor,
      attributes: look.attributes,
    };
  }

  /** Size the box to its content and center it. */
  private place(box: BoxRenderable, contentRows: number): void {
    const { terminalWidth, terminalHeight } = this.#screen.renderer;
    const width = this.width();
    const height = Math.min(terminalHeight - 2, contentRows + 2);
    box.width = width;
    box.height = height;
    box.left = Math.max(0, Math.floor((terminalWidth - width) / 2));
    box.top = Math.max(0, Math.floor((terminalHeight - height) / 2));
  }
}

function button(label: string, isActive: boolean): Line {
  return isActive ? [seg(` ${label} `, "onAccent", "accent")] : [seg(` ${label} `, "muted")];
}
