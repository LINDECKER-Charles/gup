import { ListCursor } from "../tui/list-cursor.js";
import { framePrompt, printAnswer } from "../tui/prompt-frame.js";
import {
  screenHost,
  type InteractiveView,
  type KeyPress,
  type PromptHost,
  type Viewport,
} from "../tui/prompt-host.js";
import { seg, type Line } from "../tui/styled-lines.js";

export interface SelectChoice<T> {
  readonly label: string;
  readonly value: T;
  /** Short text shown after the label. */
  readonly hint?: string;
  /** Longer explanation, shown under the list while this choice is active. */
  readonly description?: string;
  /** Why the choice can't be picked right now: it stays listed but is skipped. */
  readonly disabled?: string;
}

export type SelectEntry<T> = SelectChoice<T> | { readonly separator: true };

export interface SelectOptions<T> {
  readonly message: string;
  readonly choices: readonly SelectEntry<T>[];
  readonly default?: T;
  readonly pageSize?: number;
  /** Lines drawn above the prompt — the state the choice is made in. */
  readonly context?: readonly string[];
}

const DEFAULT_PAGE_SIZE = 14;
const MIN_PAGE_SIZE = 3;
/** PageUp / PageDown step — fixed, so a key does the same thing whatever the terminal height. */
const PAGE_STEP = 10;
/** Rows kept under the list for the active choice's description. */
const DESCRIPTION_ROWS = 4;
/** Header and hint lines framing the list. */
const FRAME_ROWS = 2;
const HINT = "↑↓ naviguer · entrée valider";

/** Single choice from a list. Resolves with the chosen value. */
export async function select<T>(
  options: SelectOptions<T>,
  host: PromptHost = screenHost,
): Promise<T> {
  const view = new SelectView(options);
  const chosen = await host.run((screen) => screen.interact(view));
  printAnswer(options.message, chosen.label);
  return chosen.value;
}

class SelectView<T> implements InteractiveView<SelectChoice<T>> {
  readonly #options: SelectOptions<T>;
  readonly #cursor: ListCursor;
  readonly #labelWidth: number;
  #answer: { value: SelectChoice<T> } | undefined;

  constructor(options: SelectOptions<T>) {
    this.#options = options;
    const { choices } = options;
    const initial = choices.findIndex((c) => isChoice(c) && c.value === options.default);
    this.#cursor = new ListCursor(choices.map(isSelectable), Math.max(0, initial));
    if (this.#cursor.index === -1) {
      throw new Error(`select: aucun choix possible pour « ${options.message} »`);
    }
    this.#labelWidth = Math.max(0, ...choices.filter(isChoice).map((c) => c.label.length));
  }

  get answer(): { value: SelectChoice<T> } | undefined {
    return this.#answer;
  }

  press(key: KeyPress): void {
    if (key.ctrl) return;
    if (key.name === "return" || key.name === "enter") this.#answer = { value: this.active() };
    else this.#cursor.keyBindings(PAGE_STEP)[key.name]?.();
  }

  render({ width, height }: Viewport): readonly Line[] {
    const context = (this.#options.context ?? []).map((text): Line => [seg(text, "muted")]);
    if (context.length > 0) context.push([]);
    const { start, end } = this.#cursor.window(this.pageSizeFor(height - context.length));
    const body = this.#options.choices
      .slice(start, end)
      .map((entry, offset) => this.row(entry, start + offset === this.#cursor.index));
    const description = this.active().description;
    if (description) body.push([], ...wrap(description, width - 4).map((t) => [seg(t, "muted")]));
    return [...context, ...framePrompt(this.#options.message, body, HINT)];
  }

  /** As many rows as asked for, fewer when the terminal is short. */
  private pageSizeFor(available: number): number {
    const describes = this.#options.choices.some((c) => isChoice(c) && c.description);
    const room = available - FRAME_ROWS - (describes ? DESCRIPTION_ROWS + 1 : 0);
    const wanted = Math.min(this.#options.pageSize ?? DEFAULT_PAGE_SIZE, this.#options.choices.length);
    return Math.max(MIN_PAGE_SIZE, Math.min(wanted, room));
  }

  private active(): SelectChoice<T> {
    return this.#options.choices[this.#cursor.index] as SelectChoice<T>;
  }

  private row(entry: SelectEntry<T>, isActive: boolean): Line {
    if (!isChoice(entry)) return [seg("─", "muted")];
    const label = entry.label.padEnd(this.#labelWidth);
    if (entry.disabled) return [seg(`○ ${label}  ${entry.disabled}`, "muted")];
    const hint = entry.hint ? seg(`  ${entry.hint}`, "muted") : seg("");
    return isActive
      ? [seg("● ", "success"), seg(label, "strong"), hint]
      : [seg("○ ", "muted"), seg(label), hint];
  }
}

function isChoice<T>(entry: SelectEntry<T>): entry is SelectChoice<T> {
  return !("separator" in entry);
}

function isSelectable<T>(entry: SelectEntry<T>): boolean {
  return isChoice(entry) && !entry.disabled;
}

/** Word wrap to `width` columns, capped at {@link DESCRIPTION_ROWS} lines. */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/)) {
    if (current && current.length + 1 + word.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  if (lines.length <= DESCRIPTION_ROWS) return lines;
  return [...lines.slice(0, DESCRIPTION_ROWS - 1), `${lines[DESCRIPTION_ROWS - 1]} …`];
}
