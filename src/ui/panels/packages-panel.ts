import type { OutdatedPackage, SelectedPackage } from "../../core/types.js";
import type { NoteColumn } from "../app/ui-preferences.js";
import type { PackageAction, PackageMarker } from "../app/view-definition.js";
import { NO_SCAN_YET } from "../text/menu-labels.js";
import { ListCursor } from "../tui/list-cursor.js";
import type { KeyPress } from "../tui/screen-host.js";
import { fillLine, fit, seg, type Line } from "../tui/styled-lines.js";
import type { PackageList, PackageRow } from "./package-list.js";
import { PAGE_STEP, placeholder, type Panel, type Viewport } from "./panel.js";

export interface PackagesHandlers {
  /** Entrée: update these packages. */
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
   * Whether a scan runs, for the wait before the first results: "scan en
   * cours…", or how to start one. Absent: results are on their way (the
   * `gup update` picker always has them).
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
const VERSION_WIDTH = 14;
const NOTE_WIDTH = 22;
/** Below this width the note column is dropped. */
const NOTE_MIN_VIEWPORT = 90;
const SCANNING = "scan en cours…";

/** How package rows are laid out for one render. */
interface Layout {
  readonly name: number;
  readonly note: number;
  /** The mark of a package, when the mark column shows at all. */
  readonly markOf: ((providerId: string, pkg: OutdatedPackage) => string) | null;
}

/**
 * The outdated packages as a table, grouped by provider, with a checkbox per
 * package. Picking one package or several is the same gesture: check what you
 * want (Space, or a click), or check nothing and press Enter on a package —
 * or on a provider to take all of it. Other views add their own keys on the
 * checked packages, and their marks on the rows.
 */
export class PackagesPanel implements Panel {
  readonly title = "Paquets";
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
  }

  hints(): string {
    if (this.#isFiltering) return "tapez pour filtrer · entrée valider · échap effacer";
    const count = this.#list?.selection.length ?? 0;
    const submit = count > 0 ? `entrée mettre à jour (${count})` : "entrée mettre à jour ce paquet";
    const rescan = this.#handlers.onRescan ? ["r rescanner"] : [];
    const base = `↑↓ naviguer · espace cocher · a tout · / filtrer · ${submit}`;
    return [base, ...rescan, ...this.actions().map((action) => action.hint)].join(" · ");
  }

  render(viewport: Viewport): readonly Line[] {
    const list = this.#list;
    if (!list) return placeholder(this.isScanPending() ? SCANNING : NO_SCAN_YET);
    if (list.total === 0 && list.rows.length === 0) return placeholder("Tout est à jour.");
    const layout = this.layout(list, viewport.width - GUTTER);
    const head = this.headLines(list, layout);
    const rows = list.rows;
    if (rows.length === 0)
      return [...head, ...placeholder(`Aucun paquet ne correspond à « ${list.filter} ».`)];
    const { start, end } = windowOf(list, viewport.height - head.length);
    const body = rows.slice(start, end).map((row, offset) => {
      const isCursor = start + offset === list.cursor;
      const line: Line = [seg(isCursor ? "› " : "  ", "accent"), ...this.rowLine(row, layout)];
      return isCursor ? fillLine(line, viewport.width, "highlight") : line;
    });
    return [...head, ...body];
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

  click(row: number, viewport: Viewport): void {
    const list = this.#list;
    if (!list || this.#isFiltering) return;
    const head = this.headLines(list, this.layout(list, viewport.width - GUTTER)).length;
    const { start } = windowOf(list, viewport.height - head);
    const index = start + row - head;
    if (row < head || index >= list.rows.length) return;
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
      return: () => this.submit(list),
      enter: () => this.submit(list),
      r: () => this.#handlers.onRescan?.(),
    };
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

  private submit(list: PackageList): void {
    const picked = list.selection.length > 0 ? list.selection : list.underCursor;
    if (picked.length > 0) this.#handlers.onLaunch(picked);
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

  private layout(list: PackageList, width: number): Layout {
    const markOf = markColumn(list, this.#options.markers?.() ?? []);
    const isNoteShown = this.#options.noteColumn?.() !== "hidden" && width >= NOTE_MIN_VIEWPORT;
    const note = isNoteShown ? NOTE_WIDTH : 0;
    const marks = markOf ? MARK_WIDTH : 0;
    const fixed = CHECKBOX_WIDTH + marks + VERSION_WIDTH * 2 + 4 + (note > 0 ? note + 1 : 0);
    return { name: Math.max(10, width - fixed), note, markOf };
  }

  /** The notice of a refused action, the filter being typed, then the column titles. */
  private headLines(list: PackageList, layout: Layout): Line[] {
    const indent = GUTTER + CHECKBOX_WIDTH + (layout.markOf ? MARK_WIDTH : 0);
    const header: Line = [
      seg(
        `${" ".repeat(indent)}${fit("Paquet", layout.name)} ${fit("Actuel", VERSION_WIDTH)}   `,
        "muted",
      ),
      seg(`${fit("Dernier", VERSION_WIDTH)} ${layout.note > 0 ? "Note" : ""}`, "muted"),
    ];
    const notice: Line[] = this.#notice ? [[seg(this.#notice, "warning")]] : [];
    if (!this.#isFiltering && !list.filter) return [...notice, header];
    const cursor = this.#isFiltering ? "█" : "";
    return [...notice, [seg("/ ", "accent"), seg(list.filter + cursor, "strong")], header];
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
    seg(` ${fit(pkg.current, VERSION_WIDTH)}`, "warning"),
    seg(" → ", "muted"),
    seg(fit(pkg.latest, VERSION_WIDTH), "success"),
    seg(layout.note > 0 ? ` ${fit(pkg.note ?? "", layout.note)}` : "", "muted"),
  ];
}

/** Rows of the list to draw so that the cursor stays in view. */
function windowOf(list: PackageList, height: number): { start: number; end: number } {
  const rows = list.rows;
  const cursor = new ListCursor(
    rows.map(() => true),
    list.cursor,
  );
  return cursor.window(Math.max(1, height));
}
