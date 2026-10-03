import type { OutdatedPackage, SelectedPackage } from "../../core/types.js";
import { ListCursor } from "../tui/list-cursor.js";
import type { KeyPress } from "../tui/screen-host.js";
import { fillLine, fit, seg, type Line } from "../tui/styled-lines.js";
import type { PackageList, PackageRow } from "./package-list.js";
import { PAGE_STEP, placeholder, type Panel, type Viewport } from "./panel.js";

/** Left margin holding the cursor marker, so the cursor shows even without colors. */
const GUTTER = 2;
const VERSION_WIDTH = 14;
const NOTE_WIDTH = 22;
/** Below this width the note column is dropped. */
const NOTE_MIN_VIEWPORT = 90;

/**
 * The outdated packages as a table, grouped by provider, with a checkbox per
 * package. Picking one package or several is the same gesture: check what you
 * want (Space, or a click), or check nothing and press Enter on a package —
 * or on a provider to take all of it.
 */
export class PackagesPanel implements Panel {
  readonly title = "Paquets";
  #list: PackageList | null = null;
  #isFiltering = false;
  readonly #onSubmit: (packages: SelectedPackage[]) => void;

  constructor(onSubmit: (packages: SelectedPackage[]) => void) {
    this.#onSubmit = onSubmit;
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
    return `↑↓ naviguer · espace cocher · a tout · / filtrer · ${submit}`;
  }

  render(viewport: Viewport): readonly Line[] {
    const list = this.#list;
    if (!list) return placeholder("scan en cours…");
    if (list.total === 0 && list.rows.length === 0) return placeholder("Tout est à jour.");
    const head = this.headerLines(list, viewport.width);
    const rows = list.rows;
    if (rows.length === 0)
      return [...head, ...placeholder(`Aucun paquet ne correspond à « ${list.filter} ».`)];
    const { start, end } = windowOf(list, viewport.height - head.length);
    const body = rows.slice(start, end).map((row, offset) => {
      const isCursor = start + offset === list.cursor;
      const line: Line = [
        seg(isCursor ? "› " : "  ", "accent"),
        ...this.rowLine(row, viewport.width - GUTTER),
      ];
      return isCursor ? fillLine(line, viewport.width, "highlight") : line;
    });
    return [...head, ...body];
  }

  press(key: KeyPress): void {
    const list = this.#list;
    if (!list) return;
    if (this.#isFiltering) return this.typeFilter(list, key);
    const actions: Record<string, () => void> = {
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
    };
    actions[key.sequence === "/" ? "/" : key.name]?.();
  }

  click(row: number, viewport: Viewport): void {
    const list = this.#list;
    if (!list || this.#isFiltering) return;
    const head = this.headerLines(list, viewport.width).length;
    const { start } = windowOf(list, viewport.height - head);
    const index = start + row - head;
    if (row < head || index >= list.rows.length) return;
    list.moveTo(index);
    list.toggleCurrent();
  }

  scroll(step: number): void {
    this.#list?.move(step);
  }

  private submit(list: PackageList): void {
    const picked = list.selection.length > 0 ? list.selection : list.underCursor;
    if (picked.length > 0) this.#onSubmit(picked);
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

  private headerLines(list: PackageList, width: number): Line[] {
    const cols = columns(width - GUTTER);
    const header: Line = [
      seg(
        `${" ".repeat(GUTTER + 6)}${fit("Paquet", cols.name)} ${fit("Actuel", VERSION_WIDTH)}   `,
        "muted",
      ),
      seg(`${fit("Dernier", VERSION_WIDTH)} ${cols.note > 0 ? "Note" : ""}`, "muted"),
    ];
    if (!this.#isFiltering && !list.filter) return [header];
    const cursor = this.#isFiltering ? "█" : "";
    return [[seg("/ ", "accent"), seg(list.filter + cursor, "strong")], header];
  }

  private rowLine(row: PackageRow, width: number): Line {
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
    return packageLine(row.pkg, list.isChecked(row.providerId, row.pkg), columns(width));
  }
}

function packageLine(pkg: OutdatedPackage, isChecked: boolean, cols: Columns): Line {
  return [
    seg(isChecked ? "  [■] " : "  [ ] ", isChecked ? "success" : "muted"),
    seg(fit(pkg.name ?? pkg.id, cols.name), isChecked ? "strong" : "plain"),
    seg(` ${fit(pkg.current, VERSION_WIDTH)}`, "warning"),
    seg(" → ", "muted"),
    seg(fit(pkg.latest, VERSION_WIDTH), "success"),
    seg(cols.note > 0 ? ` ${fit(pkg.note ?? "", cols.note)}` : "", "muted"),
  ];
}

interface Columns {
  readonly name: number;
  readonly note: number;
}

function columns(width: number): Columns {
  const note = width >= NOTE_MIN_VIEWPORT ? NOTE_WIDTH : 0;
  const fixed = 6 + VERSION_WIDTH * 2 + 4 + (note > 0 ? note + 1 : 0);
  return { name: Math.max(10, width - fixed), note };
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
