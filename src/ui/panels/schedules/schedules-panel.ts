import type { Schedule } from "../../../core/scheduler/model/types.js";
import {
  EDITOR_TITLES,
  EMPTY_SCHEDULES,
  SCHEDULES_HINTS,
  SCHEDULES_LABEL,
} from "../../text/schedule/schedule-menu-labels.js";
import { ListCursor } from "../../tui/list-cursor.js";
import type { KeyPress } from "../../tui/screen-host.js";
import { seg, wrapLine, type Line } from "../../tui/styled-lines.js";
import { PAGE_STEP, type Panel, type Viewport } from "../panel.js";
import { editorLines } from "./schedule-editor-lines.js";
import {
  ScheduleEditor,
  seedOf,
  type EditorField,
  type EditorSeed,
} from "./schedule-editor.js";
import { listLines } from "./schedule-list-lines.js";
import type { ScheduleBook, TriggerSummary } from "./schedules-port.js";

/** The list's actions with a side effect (`schedule-flows.ts`). */
export interface ListHandlers {
  /** The view came to the front: read the files again, mark the runs seen. */
  shown(): void;
  toggle(schedule: Schedule): void;
  runNow(schedule: Schedule): void;
  remove(schedule: Schedule): void;
  repairTrigger(): void;
}

/** The editor's dialogs and saving (`editor-flows.ts`). */
export interface EditorHandlers {
  chooseFrequency(editor: ScheduleEditor): void;
  chooseDay(editor: ScheduleEditor): void;
  addTarget(editor: ScheduleEditor): void;
  save(editor: ScheduleEditor): void;
  /** Échap or "Annuler": leave the editor, after a confirmation when something changed. */
  leave(editor: ScheduleEditor): void;
}

/**
 * What the panel cannot do alone — dialogs, saving, the OS trigger, running
 * a schedule: the flows answer, and call the panel back with notices and an
 * editor to open or close.
 */
export interface SchedulesHandlers {
  readonly list: ListHandlers;
  readonly editor: EditorHandlers;
}

/** Rows kept for the details under the table when the schedules do not all fit. */
const DETAILS_ROOM = 4;
/** Left margin of the how-to shown while there is no schedule. */
const EMPTY_INDENT = "  ";

/** Cursor moves of the list, by key. */
const LIST_MOVES: Readonly<Record<string, number>> = {
  up: -1,
  k: -1,
  down: 1,
  j: 1,
  pageup: -PAGE_STEP,
  pagedown: PAGE_STEP,
  home: -Infinity,
  end: Infinity,
};

/** Where things are drawn for one viewport: what a click on a row means. */
interface Layout {
  readonly lines: readonly Line[];
  /** The schedule index or editor item drawn on each row; -1 for none. */
  readonly targets: readonly number[];
}

/**
 * Planification: the schedules, their trigger and their last run (list
 * mode), or the form of one schedule (editor mode). Plain object: it renders
 * lines and reacts to keys; everything with a side effect goes through
 * {@link SchedulesHandlers}.
 */
export class SchedulesPanel implements Panel {
  readonly #book: Pick<ScheduleBook, "snapshot" | "validate" | "providerName" | "now">;
  readonly #handlers: SchedulesHandlers;
  #selectedId: string | null = null;
  #editor: ScheduleEditor | null = null;
  #trigger: TriggerSummary | null = null;
  #notice: readonly Line[] = [];

  constructor(
    book: Pick<ScheduleBook, "snapshot" | "validate" | "providerName" | "now">,
    handlers: SchedulesHandlers,
  ) {
    this.#book = book;
    this.#handlers = handlers;
  }

  get title(): string {
    const editor = this.#editor;
    if (!editor) return SCHEDULES_LABEL;
    if (editor.id === undefined) return EDITOR_TITLES.create;
    const edited = this.#schedules().find((schedule) => schedule.id === editor.id);
    return EDITOR_TITLES.edit(edited?.name ?? editor.draft().name);
  }

  get isCapturingText(): boolean {
    return (this.#editor?.typing ?? null) !== null;
  }

  get editor(): ScheduleEditor | null {
    return this.#editor;
  }

  hints(): string {
    if (!this.#editor) return SCHEDULES_HINTS.list(this.#underCursor()?.enabled === true);
    return this.#editor.typing ? SCHEDULES_HINTS.typing : SCHEDULES_HINTS.editor;
  }

  onShow(): void {
    this.#handlers.list.shown();
  }

  /** An editor open on changes not saved yet. */
  hasUnsavedChanges(): boolean {
    return this.#editor?.isDirty === true;
  }

  /** Lines shown above the list or the form until the next key, wrapped to the panel. */
  setNotice(lines: readonly Line[]): void {
    this.#notice = lines;
  }

  setTrigger(trigger: TriggerSummary | null): void {
    this.#trigger = trigger;
  }

  /** Put the cursor on this schedule. */
  select(id: string): void {
    this.#selectedId = id;
  }

  openEditor(seed: EditorSeed): void {
    this.#editor = new ScheduleEditor(seed);
  }

  closeEditor(): void {
    this.#editor = null;
  }

  render(viewport: Viewport): readonly Line[] {
    return this.#layout(viewport).lines;
  }

  press(key: KeyPress): void {
    this.#notice = [];
    const editor = this.#editor;
    if (!editor) return this.#pressInList(key);
    if (editor.typing) return this.#type(editor, key);
    if (key.ctrl && key.name === "s") return this.#handlers.editor.save(editor);
    const action = this.#editorKeys(editor)[key.name];
    action?.();
  }

  click(row: number, viewport: Viewport): void {
    const target = this.#layout(viewport).targets[row] ?? -1;
    if (target < 0) return;
    if (this.#editor) this.#editor.moveTo(target);
    else this.#selectedId = this.#schedules()[target]?.id ?? null;
  }

  scroll(step: number): void {
    if (this.#editor) this.#editor.move(step);
    else this.#moveSelection(step);
  }

  #schedules(): readonly Schedule[] {
    return this.#book.snapshot().schedules;
  }

  /** Index of the schedule under the cursor; it follows the schedule when the list changes. */
  #cursor(): number {
    const schedules = this.#schedules();
    const index = schedules.findIndex((schedule) => schedule.id === this.#selectedId);
    return index === -1 ? 0 : index;
  }

  #underCursor(): Schedule | undefined {
    return this.#schedules()[this.#cursor()];
  }

  #moveSelection(step: number): void {
    const schedules = this.#schedules();
    const index = Math.max(0, Math.min(this.#cursor() + step, schedules.length - 1));
    this.#selectedId = schedules[index]?.id ?? null;
  }

  #pressInList(key: KeyPress): void {
    const schedule = this.#underCursor();
    const name = key.name === "d" ? "delete" : key.name;
    const step = LIST_MOVES[name];
    if (step !== undefined) return this.#moveSelection(step);
    if (name === "i") return this.#handlers.list.repairTrigger();
    if (schedule) this.#act(name, schedule);
  }

  /** A key on the schedule under the cursor. */
  #act(name: string, schedule: Schedule): void {
    const actions: Record<string, () => void> = {
      return: () => this.openEditor(seedOf(schedule)),
      enter: () => this.openEditor(seedOf(schedule)),
      space: () => this.#handlers.list.toggle(schedule),
      x: () => this.#handlers.list.runNow(schedule),
      delete: () => this.#handlers.list.remove(schedule),
    };
    actions[name]?.();
  }

  #editorKeys(editor: ScheduleEditor): Record<string, () => void> {
    return {
      up: () => editor.move(-1),
      k: () => editor.move(-1),
      down: () => editor.move(1),
      j: () => editor.move(1),
      home: () => editor.moveTo(0),
      end: () => editor.moveTo(editor.items.length - 1),
      return: () => this.#activate(editor),
      enter: () => this.#activate(editor),
      space: () => this.#toggle(editor),
      delete: () => this.#removeTarget(editor),
      d: () => this.#removeTarget(editor),
      escape: () => this.#handlers.editor.leave(editor),
    };
  }

  /** Entrée on the item under the cursor. */
  #activate(editor: ScheduleEditor): void {
    const item = editor.current;
    if (item.kind === "field") return this.#activateField(editor, item.field);
    if (item.kind === "add") return this.#handlers.editor.addTarget(editor);
    if (item.kind === "save") return this.#handlers.editor.save(editor);
    if (item.kind === "cancel") return this.#handlers.editor.leave(editor);
  }

  #activateField(editor: ScheduleEditor, field: EditorField): void {
    if (field === "frequency") return this.#handlers.editor.chooseFrequency(editor);
    if (field === "day") return this.#handlers.editor.chooseDay(editor);
    if (field === "catchUp") return editor.toggleCatchUp();
    editor.startTyping();
  }

  #toggle(editor: ScheduleEditor): void {
    const item = editor.current;
    if (item.kind === "field" && item.field === "catchUp") editor.toggleCatchUp();
  }

  #removeTarget(editor: ScheduleEditor): void {
    const item = editor.current;
    if (item.kind === "target") editor.removeTarget(item.index);
  }

  /** A key while a field is being typed into. */
  #type(editor: ScheduleEditor, key: KeyPress): void {
    if (key.name === "escape") return editor.cancelTyping();
    if (key.name === "return" || key.name === "enter") return editor.commitTyping();
    if (key.ctrl && key.name === "s") {
      editor.commitTyping();
      return this.#handlers.editor.save(editor);
    }
    if (key.name === "backspace") return editor.erase();
    if (!key.ctrl && key.sequence.length === 1 && key.sequence >= " ") editor.type(key.sequence);
  }

  /** The notice on as many rows as the width needs: a trigger failure's reason is never cut. */
  #noticeLines(width: number): Line[] {
    return this.#notice.flatMap((line) => wrapLine(line, width));
  }

  #layout(viewport: Viewport): Layout {
    const editor = this.#editor;
    return editor ? this.#editorLayout(editor, viewport) : this.#listLayout(viewport);
  }

  #editorLayout(editor: ScheduleEditor, viewport: Viewport): Layout {
    const draft = editor.draft();
    const issues = [...editor.ownIssues(), ...this.#book.validate(draft, editor.id)];
    const drawn = editorLines(editor, {
      issues,
      now: this.#book.now(),
      providerName: (id) => this.#book.providerName(id),
      width: viewport.width,
    });
    const notice = this.#noticeLines(viewport.width);
    const head = notice.length;
    const lines = [...notice, ...drawn.lines];
    const focus = head + (drawn.itemLines[editor.cursor] ?? 0);
    const start = windowStart({ total: lines.length, focus, height: viewport.height });
    const items = lines.map((_, line) => drawn.itemLines.indexOf(line - head));
    return {
      lines: lines.slice(start, start + viewport.height),
      targets: items.slice(start, start + viewport.height),
    };
  }

  #listLayout(viewport: Viewport): Layout {
    const snapshot = this.#book.snapshot();
    if (snapshot.schedules.length === 0) return this.#emptyLayout(viewport);
    const cursor = this.#cursor();
    const drawn = listLines({
      snapshot,
      trigger: this.#trigger,
      cursor,
      now: this.#book.now(),
      providerName: (id) => this.#book.providerName(id),
      width: viewport.width,
    });
    const head = [...this.#noticeLines(viewport.width), ...drawn.head];
    const room = viewport.height - head.length - Math.min(DETAILS_ROOM, drawn.details.length);
    const shown = new ListCursor(
      drawn.rows.map(() => true),
      cursor,
    ).window(Math.max(1, room));
    const rows = drawn.rows.slice(shown.start, shown.end);
    const lines = [...head, ...rows, ...drawn.details].slice(0, viewport.height);
    const targets = lines.map((_, line) => {
      const row = line - head.length;
      return row >= 0 && row < rows.length ? shown.start + row : -1;
    });
    return { lines, targets };
  }

  #emptyLayout(viewport: Viewport): Layout {
    // Wrapped under its indent: at 80 columns the how-to ends on its key, p.
    const room = viewport.width - EMPTY_INDENT.length;
    const lines: Line[] = [
      ...this.#noticeLines(viewport.width),
      [],
      ...EMPTY_SCHEDULES.flatMap((text) =>
        wrapLine([seg(text, "muted")], room).map((row): Line => [seg(EMPTY_INDENT), ...row]),
      ),
    ];
    return { lines, targets: lines.map(() => -1) };
  }
}

/** First line to draw so that `focus` stays in view. */
function windowStart(window: { total: number; focus: number; height: number }): number {
  const { total, focus, height } = window;
  if (total <= height) return 0;
  const centered = focus - Math.floor(height / 2);
  return Math.max(0, Math.min(centered, total - height));
}
