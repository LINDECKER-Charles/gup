import type { Density } from "../../theme/appearance.js";
import type { KeyPress } from "../../tui/screen-host.js";
import type { Line } from "../../tui/styled-lines.js";
import { entryAtRow, QUIT, renderSidebar } from "../sidebar.js";
import type { ViewRegistry } from "./view-registry.js";

/** Keys that open the entry under the sidebar's cursor. */
const OPEN_KEYS: ReadonlySet<string> = new Set(["return", "enter", "space"]);

/**
 * Which side of the menu has the keyboard — the sidebar or the view on
 * screen — and where the sidebar's cursor stands. Moving the cursor brings
 * the view under it to the front; opening "Quitter" ends the session.
 */
export class MenuNav {
  readonly #views: ViewRegistry;
  readonly #quit: () => void;
  #isSidebarFocused = false;
  #cursor = 0;

  constructor(views: ViewRegistry, quit: () => void) {
    this.#views = views;
    this.#quit = quit;
  }

  get isSidebarFocused(): boolean {
    return this.#isSidebarFocused;
  }

  /** The view on screen takes the keyboard. */
  focusMain(): void {
    this.#isSidebarFocused = false;
  }

  /** The sidebar takes the keyboard, its cursor on the view on screen. */
  focusSidebar(): void {
    this.#isSidebarFocused = true;
    this.#cursor = this.#views.indexOf(this.#views.current);
  }

  /** Tab: the keyboard goes to the other side. */
  toggle(): void {
    if (this.#isSidebarFocused) this.focusMain();
    else this.focusSidebar();
  }

  /** A key while the sidebar has the keyboard. */
  press(key: KeyPress): void {
    if (key.name === "right") this.focusMain();
    else if (key.name === "up" || key.name === "k") this.move(-1);
    else if (key.name === "down" || key.name === "j") this.move(1);
    else if (OPEN_KEYS.has(key.name)) this.open(this.#cursor);
  }

  /** A click on the sidebar's content `row`. */
  click(row: number, density: Density): void {
    const index = entryAtRow(this.#views.layout(density), row);
    if (index !== null) this.open(index);
  }

  /** The sidebar's lines for this frame. */
  render(density: Density, width: number): Line[] {
    const state = {
      current: this.#views.current,
      cursor: this.#cursor,
      isFocused: this.#isSidebarFocused,
    };
    return renderSidebar(this.#views.layout(density), state, width);
  }

  private move(step: number): void {
    const last = this.#views.entries.length - 1;
    this.#cursor = Math.max(0, Math.min(last, this.#cursor + step));
    const entry = this.#views.entries[this.#cursor];
    if (entry && entry.id !== QUIT) this.#views.show(entry.id);
  }

  private open(index: number): void {
    const entry = this.#views.entries[index];
    if (!entry) return;
    this.#cursor = index;
    if (entry.id === QUIT) return this.#quit();
    this.#views.show(entry.id);
    this.focusMain();
  }
}
