import { ConfigWriteError } from "../../../core/config/store.js";
import { VIEW_LABELS } from "../../text/menu-labels.js";
import { OPTIONS_HINTS, OPTIONS_NOTICES } from "../../text/options-labels.js";
import type { KeyPress } from "../../tui/screen-host.js";
import { seg, type Line } from "../../tui/styled-lines.js";
import { PAGE_STEP, type Panel, type Viewport } from "../panel.js";
import type {
  OptionRow,
  OptionsControls,
  OptionSection,
  OptionShortcut,
  OptionsHost,
  OptionsView,
  SectionFactory,
} from "./option-row.js";
import { listItems, renderItems, rowsOf, visibleRange, type ListItem } from "./settings-list.js";

/** ← → step the value of the row under the cursor. */
const STEP_KEYS: Readonly<Record<string, -1 | 1>> = { left: -1, h: -1, right: 1, l: 1 };
const ACTIVATE_KEYS: ReadonlySet<string> = new Set(["return", "enter", "space"]);
const MOVES: Readonly<Record<string, number>> = {
  up: -1,
  k: -1,
  down: 1,
  j: 1,
  pageup: -PAGE_STEP,
  pagedown: PAGE_STEP,
  home: -Infinity,
  end: Infinity,
};

/**
 * The Options view: settings grouped in sections, edited in place. The
 * cursor skips section headers; Entrée toggles or cycles a value (or opens a
 * sub-view or a dialog), ← → step it, and a sub-view (theme picker, colour
 * editor, provider filter) replaces the list until it closes. Booleans and
 * values are saved at once; a save that fails keeps the value for the
 * session and says so on the line above the list.
 */
export class OptionsPanel implements Panel {
  readonly isCapturingText = false;
  readonly #host: OptionsHost;
  readonly #sections: readonly OptionSection[];
  #view: OptionsView | null = null;
  #cursorId: string | null = null;
  #notice: Line | null = null;
  #isScanDirty = false;

  constructor(sections: readonly SectionFactory[], host: OptionsHost) {
    this.#host = host;
    const controls = this.controls();
    this.#sections = sections.map((make) => make(controls, host));
  }

  get title(): string {
    return this.#view ? `${VIEW_LABELS.options} › ${this.#view.title}` : VIEW_LABELS.options;
  }

  hints(): string {
    if (this.#view) return this.#view.hints();
    const tail = this.#isScanDirty ? [OPTIONS_HINTS.rescan] : [];
    return [OPTIONS_HINTS.list, ...this.shortcuts().map((shortcut) => shortcut.hint), ...tail].join(
      " · ",
    );
  }

  render(viewport: Viewport): readonly Line[] {
    if (this.#view) return this.#view.render(viewport);
    const pinned = this.pinnedLines();
    const items = this.items();
    const room = { width: viewport.width, height: viewport.height - pinned.length };
    return [...pinned, ...renderItems(items, this.cursorIn(items), room)];
  }

  press(key: KeyPress): void {
    if (this.#view) return this.#view.press(key);
    const items = this.items();
    const cursor = this.cursorIn(items);
    if (this.isStep(key, cursor)) return cursor?.step?.(STEP_KEYS[key.name] ?? 1);
    if (ACTIVATE_KEYS.has(key.name)) return this.activate(cursor);
    const move = MOVES[key.name];
    if (move !== undefined) return this.move(rowsOf(items), cursor, move);
    this.pressShortcut(key);
  }

  click(row: number, viewport: Viewport): void {
    if (this.#view) return this.#view.click(row, viewport);
    const pinned = this.pinnedLines().length;
    const items = this.items();
    const { start } = visibleRange(items, this.cursorIn(items), viewport.height - pinned);
    const item = row >= pinned ? items[start + row - pinned] : undefined;
    if (item?.kind !== "row") return;
    this.#cursorId = item.row.id;
    this.activate(item.row);
  }

  scroll(step: number): void {
    this.press({ name: step < 0 ? "up" : "down", ctrl: false, sequence: "" });
  }

  /** A sub-view takes every key (q and Tab stay the menu's); the list, ← → on a stepping row. */
  wantsKey(key: KeyPress): boolean {
    if (this.#view) return true;
    return this.isStep(key, this.cursorIn(this.items()));
  }

  private isStep(key: KeyPress, cursor: OptionRow | undefined): boolean {
    return key.name in STEP_KEYS && cursor?.step !== undefined && cursor.isEnabled();
  }

  private activate(row: OptionRow | undefined): void {
    if (row?.isEnabled()) row.activate();
  }

  private move(rows: readonly OptionRow[], cursor: OptionRow | undefined, delta: number): void {
    const at = cursor ? rows.indexOf(cursor) : 0;
    const next = Math.min(rows.length - 1, Math.max(0, at + delta));
    this.#cursorId = rows[next]?.id ?? null;
  }

  /** `r` once a scan setting changed, or a key a section answers (`c`). */
  private pressShortcut(key: KeyPress): void {
    if (key.name === "r" && this.#isScanDirty) {
      this.#isScanDirty = false;
      return this.#host.rescan();
    }
    this.shortcuts()
      .find((shortcut) => shortcut.key === key.name)
      ?.run();
  }

  private items(): ListItem[] {
    return listItems(this.#sections, this.#host.density());
  }

  /** The row under the cursor: the remembered one, else the first. */
  private cursorIn(items: readonly ListItem[]): OptionRow | undefined {
    const rows = rowsOf(items);
    return rows.find((row) => row.id === this.#cursorId) ?? rows[0];
  }

  private shortcuts(): OptionShortcut[] {
    return this.#sections.flatMap((section) => section.shortcuts?.() ?? []);
  }

  /** Lines that stay above the list whatever its scroll: the notice, the rescan offer. */
  private pinnedLines(): Line[] {
    const lines: Line[] = [
      ...(this.#notice ? [this.#notice] : []),
      ...(this.#isScanDirty ? [[seg(OPTIONS_NOTICES.rescan, "warning")]] : []),
    ];
    return lines.length > 0 ? [...lines, []] : [];
  }

  private controls(): OptionsControls {
    return {
      open: (view) => void (this.#view = view),
      close: () => void (this.#view = null),
      save: (write) => this.save(write),
      notify: (notice) => void (this.#notice = notice),
      scanSettingsChanged: () => void (this.#isScanDirty = true),
    };
  }

  private save(write: () => void): boolean {
    try {
      write();
      this.#notice = null;
      return true;
    } catch (error) {
      if (!(error instanceof ConfigWriteError)) throw error;
      this.#notice = [seg(OPTIONS_NOTICES.notSaved(error.message), "warning")];
      return false;
    }
  }
}
