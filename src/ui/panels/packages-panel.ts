import type { OutdatedPackage, SelectedPackage } from "../../core/types.js";
import type { NoteColumn } from "../app/ui-preferences.js";
import type { PackageAction, PackageMarker } from "../app/view-definition.js";
import { NO_SCAN_YET, VIEW_LABELS } from "../text/menu-labels.js";
import {
  LAUNCH_NOTICES,
  PACKAGE_COLUMNS,
  PACKAGES_HINTS,
  PACKAGES_PLACEHOLDERS,
} from "../text/packages-labels.js";
import { ListCursor } from "../tui/list-cursor.js";
import type { KeyPress } from "../tui/screen-host.js";
import { fillLine, fit, seg, type Line } from "../tui/styled-lines.js";
import type { PackageList, PackageRow } from "./package-list.js";
import { PAGE_STEP, placeholder, type Panel, type Viewport } from "./panel.js";
import { selectionBar, type SelectionBarState } from "./selection-bar.js";

export interface PackagesHandlers {
  /** Entrée, or a click on the selection bar: update these checked packages (never empty). */
  onLaunch(packages: SelectedPackage[]): void;
  /** `r`: scan again. Absent where no scan can run (the `gup update` picker). */
  onRescan?(): void;
}

export interface PackagesOptions {
  /** Keys other views add (the scheduler's `p`): they act on the checked packages. */
  readonly actions?: () => readonly PackageAction[];
  /** One-column marks after the checkbox; the column only appears when one shows. */
  readonly markers?: () => readonly PackageMarker[];
  readonly noteColumn?: () => NoteColumn;
  /**
   * Whether a scan runs. Before the first results it picks the wait message
   * ("scan en cours…", or how to start one); afterwards it holds Entrée back,
   * since the scan is about to replace the table. Absent: results are on
   * their way and never replaced (the `gup update` picker always has them).
   */
  readonly isScanning?: () => boolean;
}

/** Keys the table itself uses: a package action never takes one of them. */
export const RESERVED_PACKAGE_KEYS: ReadonlySet<string> = new Set([
  ...["up", "down", "left", "right", "j", "k", "pageup", "pagedown", "home", "end"],
  ...["space", "a", "/", "escape", "return", "enter", "r", "q", "tab"],
]);

/** Left margin holding the cursor marker, so the cursor shows even without colors. */
const GUTTER = 2;
/** The checkbox before a package name: `  [■] `. */
const CHECKBOX_WIDTH = 6;
/** A mark and its space: `◷ `. */
const MARK_WIDTH = 2;
/** A version column's widest: longer versions are cut. */
const VERSION_WIDTH = 14;
/** A version column's narrowest: its heading ("Dernier") stays whole. */
const MIN_VERSION_WIDTH = Math.max(
  PACKAGE_COLUMNS.current.length,
  PACKAGE_COLUMNS.latest.length,
);
const NOTE_WIDTH = 22;
/** Below this width the note column is dropped. */
const NOTE_MIN_VIEWPORT = 90;
const MIN_NAME_WIDTH = 10;
/** The spaces and arrow between the version columns: ` ` + ` → `. */
const VERSION_SEPARATORS = 4;
const HINT_SEPARATOR = " · ";

/** How package rows are laid out for one render. */
interface Layout {
  /** The whole viewport: the cursor's highlight spans it. */
  readonly width: number;
  /** As wide as the scan's longest name, within the room the other columns leave. */
  readonly name: number;
  /** Each version column: as wide as the scan's longest version, within its bounds. */
  readonly version: number;
  readonly note: number;
  /** The mark of a package, when the mark column shows at all. */
  readonly markOf: ((providerId: string, pkg: OutdatedPackage) => string) | null;
}

/** The slice of `list.rows` drawn: `start` included, `end` excluded. */
interface RowWindow {
  readonly start: number;
  readonly end: number;
}

/** One render of the table, with the rows a click maps back to. */
interface Composition extends RowWindow {
  readonly lines: readonly Line[];
  /** Content row where `list.rows[start]` is drawn. */
  readonly firstRow: number;
  /** Content row of the selection bar; -1 when the table has no package to check. */
  readonly barRow: number;
}

/**
 * The outdated packages as a table, grouped by provider, with a checkbox per
 * package and a selection bar at its foot. Picking is checking (Space, a
 * click, `a` for everything shown); Entrée — or a click on the bar — updates
 * the checked packages, those the filter hides included, and nothing else:
 * with nothing checked, or while a scan runs, it explains instead. Other
 * views add their own keys on the checked packages, and their marks on the
 * rows.
 */
export class PackagesPanel implements Panel {
  readonly title = VIEW_LABELS.packages;
  readonly #handlers: PackagesHandlers;
  readonly #options: PackagesOptions;
  #list: PackageList | null = null;
  #isFiltering = false;
  #notice: string | null = null;

  constructor(handlers: PackagesHandlers, options: PackagesOptions = {}) {
    this.#handlers = handlers;
    this.#options = options;
  }

  get isCapturingText(): boolean {
    return this.#isFiltering;
  }

  setList(list: PackageList): void {
    this.#list = list;
    this.#isFiltering = false;
    this.#notice = null;
  }

  hints(): string {
    if (this.#isFiltering) return PACKAGES_HINTS.filtering;
    const rescan = this.#handlers.onRescan ? [PACKAGES_HINTS.rescan] : [];
    const list = this.#list;
    if (!list) return rescan.join(HINT_SEPARATOR);
    const checked = list.selection.length;
    const canLaunch = checked > 0 && !this.isScanRunning();
    return [
      PACKAGES_HINTS.navigate,
      PACKAGES_HINTS.check,
      list.isAllVisibleChecked() ? PACKAGES_HINTS.clearAll : PACKAGES_HINTS.checkAll,
      PACKAGES_HINTS.filter,
      ...(canLaunch ? [PACKAGES_HINTS.launch(checked)] : []),
      ...rescan,
      ...this.actions().map((action) => action.hint),
    ].join(HINT_SEPARATOR);
  }

  render(viewport: Viewport): readonly Line[] {
    const list = this.#list;
    if (!list) {
      return placeholder(this.isScanPending() ? PACKAGES_PLACEHOLDERS.scanning : NO_SCAN_YET);
    }
    if (list.total === 0 && list.rows.length === 0) {
      return placeholder(PACKAGES_PLACEHOLDERS.upToDate);
    }
    return this.compose(list, viewport).lines;
  }

  press(key: KeyPress): void {
    const list = this.#list;
    if (!list) return this.pressBeforeResults(key);
    this.#notice = null;
    if (this.#isFiltering) return this.typeFilter(list, key);
    const name = key.sequence === "/" ? "/" : key.name;
    const own = this.ownKeys(list)[name];
    if (own) return own();
    this.runAction(list, name);
  }

  /** No results yet: only `r` means something — the scan the panel suggests. */
  private pressBeforeResults(key: KeyPress): void {
    if (key.name === "r") this.#handlers.onRescan?.();
  }

  /** A package or provider row toggles; the selection bar launches. */
  click(row: number, viewport: Viewport): void {
    const list = this.#list;
    if (!list || this.#isFiltering) return;
    const { firstRow, start, end, barRow } = this.compose(list, viewport);
    this.#notice = null;
    if (row === barRow) return this.launch(list);
    const index = start + row - firstRow;
    if (row < firstRow || index >= end) return;
    list.moveTo(index);
    list.toggleCurrent();
  }

  scroll(step: number): void {
    this.#list?.move(step);
  }

  private ownKeys(list: PackageList): Record<string, () => void> {
    return {
      up: () => list.move(-1),
      k: () => list.move(-1),
      down: () => list.move(1),
      j: () => list.move(1),
      pageup: () => list.move(-PAGE_STEP),
      pagedown: () => list.move(PAGE_STEP),
      home: () => list.moveTo(0),
      end: () => list.moveTo(list.rows.length - 1),
      space: () => list.toggleCurrent(),
      a: () => list.toggleAllVisible(),
      "/": () => (this.#isFiltering = true),
      escape: () => list.setFilter(""),
      return: () => this.launch(list),
      enter: () => this.launch(list),
      r: () => this.#handlers.onRescan?.(),
    };
  }

  /** The checked packages, filtered-out ones included — or why not. */
  private launch(list: PackageList): void {
    const selection = list.selection;
    const refusal = this.launchRefusal(selection.length);
    if (refusal) this.#notice = refusal;
    else this.#handlers.onLaunch(selection);
  }

  private launchRefusal(checked: number): string | null {
    if (this.isScanRunning()) return LAUNCH_NOTICES.scanning;
    return checked === 0 ? LAUNCH_NOTICES.empty : null;
  }

  /** Another view's key: on the checked packages, or a notice when none is. */
  private runAction(list: PackageList, name: string): void {
    const action = this.actions().find((candidate) => candidate.key === name);
    if (!action) return;
    const selection = list.selection;
    if (selection.length === 0) this.#notice = action.emptyNotice;
    else action.run(selection);
  }

  private actions(): PackageAction[] {
    const actions = this.#options.actions?.() ?? [];
    return actions.filter((action) => !RESERVED_PACKAGE_KEYS.has(action.key));
  }

  /** Before the first results: a scan is on its way, unless the menu says none runs. */
  private isScanPending(): boolean {
    return this.#options.isScanning?.() ?? true;
  }

  /** A scan runs now, about to replace the table: no update starts from it. */
  private isScanRunning(): boolean {
    return this.#options.isScanning?.() === true;
  }

  private typeFilter(list: PackageList, key: KeyPress): void {
    if (key.name === "escape") list.setFilter("");
    if (["escape", "return", "enter"].includes(key.name)) {
      this.#isFiltering = false;
      return;
    }
    if (key.name === "backspace") return list.setFilter(list.filter.slice(0, -1));
    if (!key.ctrl && key.sequence.length === 1 && key.sequence >= " ") {
      list.setFilter(list.filter + key.sequence);
    }
  }

  /**
   * Filter and column titles, the rows that fit around the cursor, then —
   * when there is a package to check — the selection bar on the last row.
   */
  private compose(list: PackageList, viewport: Viewport): Composition {
    const layout = this.layout(list, viewport.width);
    const head = this.headLines(list, layout);
    const foot = list.total > 0 ? selectionBar(this.barState(list), viewport.width) : [];
    const window = windowOf(list, viewport.height - head.length - foot.length);
    const body = this.bodyLines(list, window, layout);
    const gap = viewport.height - head.length - body.length - foot.length;
    const lines = [...head, ...body, ...blankLines(gap), ...foot];
    const barRow = foot.length > 0 ? lines.length - 1 : -1;
    return { lines, firstRow: head.length, ...window, barRow };
  }

  /** The rows in `window`, the cursor's marked and highlighted; or why there are none. */
  private bodyLines(list: PackageList, window: RowWindow, layout: Layout): Line[] {
    if (list.rows.length === 0) return placeholder(PACKAGES_PLACEHOLDERS.noMatch(list.filter));
    return list.rows.slice(window.start, window.end).map((row, offset) => {
      const isCursor = window.start + offset === list.cursor;
      const line: Line = [seg(isCursor ? "› " : "  ", "accent"), ...this.rowLine(row, layout)];
      return isCursor ? fillLine(line, layout.width, "highlight") : line;
    });
  }

  private barState(list: PackageList): SelectionBarState {
    const checked = list.selection.length;
    const canLaunch = !this.isScanRunning();
    return { checked, total: list.total, canLaunch, notice: this.#notice };
  }

  private layout(list: PackageList, width: number): Layout {
    const markOf = markColumn(list, this.#options.markers?.() ?? []);
    const rowWidth = width - GUTTER;
    const isNoteShown = this.#options.noteColumn?.() !== "hidden" && rowWidth >= NOTE_MIN_VIEWPORT;
    const note = isNoteShown ? NOTE_WIDTH : 0;
    const marks = markOf ? MARK_WIDTH : 0;
    const longest = list.longest;
    const version = Math.min(VERSION_WIDTH, Math.max(MIN_VERSION_WIDTH, longest.version));
    const versions = version * 2 + VERSION_SEPARATORS;
    const fixed = CHECKBOX_WIDTH + marks + versions + (note > 0 ? note + 1 : 0);
    // As wide as the longest name, so the versions follow the names on a wide terminal.
    const name = Math.max(MIN_NAME_WIDTH, Math.min(rowWidth - fixed, longest.name));
    return { width, name, version, note, markOf };
  }

  /** The filter being typed (or applied), then the column titles. */
  private headLines(list: PackageList, layout: Layout): Line[] {
    const indent = GUTTER + CHECKBOX_WIDTH + (layout.markOf ? MARK_WIDTH : 0);
    const { name, current, latest, note } = PACKAGE_COLUMNS;
    const versions = `${fit(current, layout.version)}   ${fit(latest, layout.version)}`;
    const header: Line = [
      seg(`${" ".repeat(indent)}${fit(name, layout.name)} ${versions}`, "muted"),
      seg(` ${layout.note > 0 ? note : ""}`, "muted"),
    ];
    if (!this.#isFiltering && !list.filter) return [header];
    const cursor = this.#isFiltering ? "█" : "";
    return [[seg("/ ", "accent"), seg(list.filter + cursor, "strong")], header];
  }

  private rowLine(row: PackageRow, layout: Layout): Line {
    const list = this.#list as PackageList;
    if (row.kind === "failure") {
      return [seg("✖ ", "danger"), seg(row.title, "strong"), seg(`  ${row.error}`, "danger")];
    }
    if (row.kind === "group") {
      const { checked, total } = list.groupState(row.providerId);
      const box = checked === 0 ? "[ ]" : checked === total ? "[■]" : "[–]";
      return [
        seg(`${box} `, checked > 0 ? "success" : "muted"),
        seg(row.title, "strong"),
        seg(`  ${checked}/${total}`, "muted"),
      ];
    }
    const isChecked = list.isChecked(row.providerId, row.pkg);
    const mark = layout.markOf?.(row.providerId, row.pkg);
    return packageLine({ pkg: row.pkg, isChecked, ...(mark !== undefined && { mark }) }, layout);
  }
}

function blankLines(count: number): Line[] {
  return Array.from({ length: Math.max(0, count) }, () => []);
}

/**
 * The mark of each package, or null when no visible package has one: the
 * column then takes no room at all.
 */
function markColumn(
  list: PackageList,
  markers: readonly PackageMarker[],
): ((providerId: string, pkg: OutdatedPackage) => string) | null {
  if (markers.length === 0) return null;
  const glyphOf = (providerId: string, pkg: OutdatedPackage): string | null => {
    for (const marker of markers) {
      const glyph = marker.glyphFor(providerId, pkg);
      if (glyph !== null) return glyph;
    }
    return null;
  };
  const isShown = list.rows.some(
    (row) => row.kind === "package" && glyphOf(row.providerId, row.pkg) !== null,
  );
  return isShown ? (providerId, pkg) => glyphOf(providerId, pkg) ?? " " : null;
}

function packageLine(
  row: { readonly pkg: OutdatedPackage; readonly isChecked: boolean; readonly mark?: string },
  layout: Layout,
): Line {
  const { pkg, isChecked } = row;
  return [
    seg(isChecked ? "  [■] " : "  [ ] ", isChecked ? "success" : "muted"),
    ...(row.mark !== undefined ? [seg(`${row.mark} `, "accent")] : []),
    seg(fit(pkg.name ?? pkg.id, layout.name), isChecked ? "strong" : "plain"),
    seg(` ${fit(pkg.current, layout.version)}`, "warning"),
    seg(" → ", "muted"),
    seg(fit(pkg.latest, layout.version), "success"),
    seg(layout.note > 0 ? ` ${fit(pkg.note ?? "", layout.note)}` : "", "muted"),
  ];
}

/** Rows of the list to draw so that the cursor stays in view. */
function windowOf(list: PackageList, height: number): RowWindow {
  const rows = list.rows;
  const cursor = new ListCursor(
    rows.map(() => true),
    list.cursor,
  );
  return cursor.window(Math.max(1, height));
}
