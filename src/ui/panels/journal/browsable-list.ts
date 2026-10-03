import type { KeyPress } from "../../tui/screen-host.js";
import { PAGE_STEP } from "../panel.js";

/**
 * The state every journal list shares: the items, a scope (a type or level
 * filter the tab sets), a typed text filter, a cursor that stops at both
 * ends, and a detail mode that scrolls on its own. The tab draws; this only
 * holds what is selected, filtered and open.
 */

export interface BrowsableOptions<T> {
  /** The text `/` filters on; without it the list has no text filter. */
  readonly searchText?: (item: T) => string;
}

interface Window {
  readonly start: number;
  readonly end: number;
}

const NAVIGATION: Readonly<Record<string, number>> = {
  up: -1,
  k: -1,
  down: 1,
  j: 1,
  pageup: -PAGE_STEP,
  pagedown: PAGE_STEP,
};

export class BrowsableList<T> {
  readonly #searchText: ((item: T) => string) | undefined;
  #items: readonly T[] = [];
  #search: readonly string[] = [];
  #visible: readonly T[] = [];
  #scope: (item: T) => boolean = () => true;
  #filter = "";
  #isTyping = false;
  #cursor = 0;
  #detailOffset: number | null = null;

  constructor(options: BrowsableOptions<T> = {}) {
    this.#searchText = options.searchText;
  }

  get visible(): readonly T[] {
    return this.#visible;
  }

  get cursor(): number {
    return this.#cursor;
  }

  get current(): T | undefined {
    return this.#visible[this.#cursor];
  }

  get filter(): string {
    return this.#filter;
  }

  get isTyping(): boolean {
    return this.#isTyping;
  }

  get isDetailOpen(): boolean {
    return this.#detailOffset !== null;
  }

  /** Typing a filter or reading a detail: the list takes every key. */
  get isModal(): boolean {
    return this.#isTyping || this.isDetailOpen;
  }

  setItems(items: readonly T[]): void {
    this.#items = items;
    const searchText = this.#searchText;
    this.#search = searchText ? items.map((item) => searchText(item).toLowerCase()) : [];
    this.#detailOffset = null;
    this.refresh();
  }

  /** Narrow the list to the items `scope` keeps (the text filter still applies). */
  setScope(scope: (item: T) => boolean): void {
    this.#scope = scope;
    this.refresh();
  }

  /** True when the key was the list's. */
  press(key: KeyPress): boolean {
    if (this.#isTyping) return this.type(key);
    if (this.isDetailOpen) return this.pressInDetail(key);
    return this.pressInList(key);
  }

  scroll(step: number): void {
    if (this.#detailOffset !== null) this.#detailOffset = Math.max(0, this.#detailOffset + step);
    else this.moveTo(this.#cursor + step);
  }

  moveTo(index: number): void {
    this.#cursor = Math.max(0, Math.min(index, this.#visible.length - 1));
  }

  /** Rows to draw so the cursor stays in view, centred when the list is longer. */
  window(height: number): Window {
    const total = this.#visible.length;
    if (total <= height) return { start: 0, end: total };
    const centred = this.#cursor - Math.floor(height / 2);
    const start = Math.min(Math.max(0, centred), total - height);
    return { start, end: start + height };
  }

  /** The first detail line to draw, kept so the last page stays full. */
  detailStart(lineCount: number, height: number): number {
    const start = Math.min(this.#detailOffset ?? 0, Math.max(0, lineCount - height));
    if (this.#detailOffset !== null) this.#detailOffset = start;
    return start;
  }

  private pressInList(key: KeyPress): boolean {
    const action = this.listActions()[key.sequence === "/" ? "/" : key.name];
    return action ? action() : false;
  }

  private listActions(): Record<string, () => boolean> {
    const moveTo = (index: number) => () => {
      this.moveTo(index);
      return true;
    };
    const steps = Object.entries(NAVIGATION).map(([name, step]) => [
      name,
      moveTo(this.#cursor + step),
    ]);
    return {
      ...Object.fromEntries(steps),
      home: moveTo(0),
      end: moveTo(this.#visible.length - 1),
      "/": () => this.#searchText !== undefined && (this.#isTyping = true),
      escape: () => this.#filter !== "" && this.setFilter(""),
      return: () => this.openDetail(),
      enter: () => this.openDetail(),
    };
  }

  private openDetail(): boolean {
    if (this.current === undefined) return false;
    this.#detailOffset = 0;
    return true;
  }

  private pressInDetail(key: KeyPress): boolean {
    const step = NAVIGATION[key.name];
    if (step !== undefined) this.scroll(step);
    if (key.name === "escape") this.#detailOffset = null;
    return true;
  }

  private type(key: KeyPress): boolean {
    if (key.name === "escape") this.setFilter("");
    if (["escape", "return", "enter"].includes(key.name)) {
      this.#isTyping = false;
      return true;
    }
    if (key.name === "backspace") return this.setFilter(this.#filter.slice(0, -1));
    if (!key.ctrl && key.sequence.length === 1 && key.sequence >= " ") {
      this.setFilter(this.#filter + key.sequence);
    }
    return true;
  }

  private setFilter(filter: string): true {
    this.#filter = filter;
    this.refresh();
    return true;
  }

  private refresh(): void {
    const needle = this.#filter.toLowerCase();
    const matches = (index: number) =>
      needle === "" || (this.#search[index] ?? "").includes(needle);
    this.#visible = this.#items.filter((item, index) => this.#scope(item) && matches(index));
    this.moveTo(this.#cursor);
  }
}
