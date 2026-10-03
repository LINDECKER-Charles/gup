import { ListCursor } from "../tui/list-cursor.js";
import { framePrompt, printAnswer } from "../tui/prompt-frame.js";
import {
  screenHost,
  type InteractiveView,
  type KeyPress,
  type PromptHost,
  type Viewport,
} from "../tui/prompt-host.js";
import { seg, type Line, type Segment } from "../tui/styled-lines.js";

export interface CheckboxChoice<T> {
  readonly label: string;
  readonly value: T;
  readonly hint?: string;
  readonly checked?: boolean;
}

/** A titled group; an empty title draws the choices without a header row. */
export interface CheckboxGroup<T> {
  readonly title: string;
  readonly choices: readonly CheckboxChoice<T>[];
}

export interface CheckboxOptions<T> {
  readonly message: string;
  readonly groups: readonly CheckboxGroup<T>[];
  readonly pageSize?: number;
}

const DEFAULT_PAGE_SIZE = 18;
const MIN_PAGE_SIZE = 3;
/** PageUp / PageDown step — fixed, so a key does the same thing whatever the terminal height. */
const PAGE_STEP = 10;
/** Header and hint lines framing the list. */
const FRAME_ROWS = 2;
const HINT = "↑↓ naviguer · espace cocher · a tout · entrée valider";

/**
 * Multiple choice, optionally grouped. Space on a group header toggles the
 * whole group, `a` toggles everything. Resolves with the checked values, in
 * display order.
 */
export async function checkbox<T>(
  options: CheckboxOptions<T>,
  host: PromptHost = screenHost,
): Promise<T[]> {
  const view = new CheckboxView(options);
  const picked = await host.run((screen) => screen.interact(view));
  printAnswer(options.message, `${picked.length} sélectionné(s)`);
  return picked;
}

/** One drawable row: a group header or a choice, by index into the flat list. */
type Row = { kind: "group"; group: number } | { kind: "choice"; group: number; choice: number };

class CheckboxView<T> implements InteractiveView<T[]> {
  readonly #options: CheckboxOptions<T>;
  readonly #rows: Row[];
  readonly #checked: boolean[][];
  readonly #cursor: ListCursor;
  readonly #labelWidth: number;
  #answer: { value: T[] } | undefined;

  constructor(options: CheckboxOptions<T>) {
    this.#options = options;
    this.#rows = flattenRows(options.groups);
    this.#checked = options.groups.map((g) => g.choices.map((c) => c.checked === true));
    this.#cursor = new ListCursor(this.#rows.map(() => true));
    const labels = options.groups.flatMap((g) => g.choices.map((c) => c.label.length));
    this.#labelWidth = Math.max(0, ...labels);
  }

  get answer(): { value: T[] } | undefined {
    return this.#answer;
  }

  press(key: KeyPress): void {
    if (key.ctrl) return;
    const bindings: Record<string, () => void> = {
      ...this.#cursor.keyBindings(PAGE_STEP),
      space: () => this.toggleRow(),
      a: () => this.toggleAll(),
      return: () => (this.#answer = { value: this.values() }),
      enter: () => (this.#answer = { value: this.values() }),
    };
    bindings[key.name]?.();
  }

  render({ height }: Viewport): readonly Line[] {
    const wanted = Math.min(this.#options.pageSize ?? DEFAULT_PAGE_SIZE, this.#rows.length);
    const pageSize = Math.max(MIN_PAGE_SIZE, Math.min(wanted, height - FRAME_ROWS));
    const { start, end } = this.#cursor.window(pageSize);
    const body = this.#rows
      .slice(start, end)
      .map((row, offset) => this.renderRow(row, start + offset === this.#cursor.index));
    const total = this.#checked.flat().length;
    const count = this.#checked.flat().filter(Boolean).length;
    return framePrompt(`${this.#options.message}  ${count}/${total}`, body, HINT);
  }

  private toggleRow(): void {
    const row = this.#rows[this.#cursor.index];
    if (!row) return;
    const group = this.#checked[row.group] ?? [];
    if (row.kind === "choice") group[row.choice] = !group[row.choice];
    else group.fill(!group.every(Boolean));
  }

  private toggleAll(): void {
    const next = !this.#checked.flat().every(Boolean);
    for (const group of this.#checked) group.fill(next);
  }

  private values(): T[] {
    return this.#options.groups.flatMap((g, gi) =>
      g.choices.filter((_, ci) => this.#checked[gi]?.[ci]).map((c) => c.value),
    );
  }

  private renderRow(row: Row, isActive: boolean): Line {
    const pointer = seg(isActive ? "› " : "  ", "accent");
    const group = this.#options.groups[row.group] as CheckboxGroup<T>;
    const states = this.#checked[row.group] as boolean[];
    if (row.kind === "group") return [pointer, ...groupHeader(group.title, states)];
    const choice = group.choices[row.choice] as CheckboxChoice<T>;
    return [
      pointer,
      seg(group.title ? "  " : ""),
      box(states[row.choice] === true),
      seg(` ${choice.label.padEnd(this.#labelWidth)}`, isActive ? "strong" : "plain"),
      seg(`  ${choice.hint ?? ""}`, "muted"),
    ];
  }
}

/** `◼ winget  2/3` — the box is checked only when the whole group is. */
function groupHeader(title: string, states: readonly boolean[]): Line {
  const done = states.filter(Boolean).length;
  return [
    box(states.every(Boolean)),
    seg(` ${title}`, "strong"),
    seg(`  ${done}/${states.length}`, "muted"),
  ];
}

function box(isChecked: boolean): Segment {
  return isChecked ? seg("◼", "success") : seg("◻", "muted");
}

function flattenRows<T>(groups: readonly CheckboxGroup<T>[]): Row[] {
  return groups.flatMap((g, group): Row[] => [
    ...(g.title ? [{ kind: "group", group } as const] : []),
    ...g.choices.map((_, choice) => ({ kind: "choice", group, choice }) as const),
  ]);
}
