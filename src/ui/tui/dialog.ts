import type { BoxRenderable, TextRenderable } from "@opentui/core";
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
const ACCENT = 6;

/** The keys a dialog reacts to while it is on top. */
interface ActiveDialog {
  press(key: KeyPress): void;
}

/**
 * Modal boxes drawn over whatever the screen shows: a confirmation, a choice
 * in a list, a line of text. While one is open its owner routes every key
 * to {@link press}; Escape closes it with "no answer" (`false` for a
 * confirmation, `undefined` otherwise).
 */
export class DialogLayer {
  readonly #screen: Screen;
  #active: ActiveDialog | null = null;

  constructor(screen: Screen) {
    this.#screen = screen;
  }

  get isOpen(): boolean {
    return this.#active !== null;
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
    return this.open(spec, (draw, done) => {
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
    return this.open<T | undefined>(spec, (draw, done) => {
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
    return this.open<string | undefined>(spec, (draw, done, box) => {
      const { renderer, tui } = this.#screen;
      const field = new tui.InputRenderable(renderer, {
        id: "gup-dialog-input",
        value: spec.default ?? "",
      });
      const hint = new tui.TextRenderable(renderer, { id: "gup-dialog-hint", wrapMode: "none" });
      const say = (line: Line): void => void (hint.content = toStyledText(tui, [line]));
      box.add(field);
      box.add(hint);
      say([seg("Entrée valider · Échap annuler", "muted")]);
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
   * and remove the box once it finishes. `setup` returns the key handler.
   */
  private open<T>(
    spec: DialogBase,
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
        body.content = toStyledText(this.#screen.tui, [
          ...text.map((t): Line => [seg(t)]),
          ...controls,
        ]);
        // Every child after the body (an input field, its hint) is one row high.
        this.place(box, text.length + controls.length + box.getChildren().length - 1);
      };
      const done = (value: T): void => {
        this.#active = null;
        this.#screen.renderer.root.remove(box);
        box.destroyRecursively();
        resolve(value);
      };
      this.#active = { press: setup(draw, done, box) };
    });
  }

  private createBox(title: string): { box: BoxRenderable; body: TextRenderable } {
    const { renderer, tui } = this.#screen;
    const box = new tui.BoxRenderable(renderer, {
      id: "gup-dialog",
      position: "absolute",
      zIndex: 100,
      title: ` ${title} `,
      border: true,
      borderStyle: "double",
      borderColor: tui.RGBA.fromIndex(ACCENT),
      backgroundColor: tui.RGBA.defaultBackground(),
      shouldFill: true,
      paddingX: 1,
      flexDirection: "column",
    });
    const body = new tui.TextRenderable(renderer, { id: "gup-dialog-body", wrapMode: "none" });
    box.add(body);
    renderer.root.add(box);
    return { box, body };
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
