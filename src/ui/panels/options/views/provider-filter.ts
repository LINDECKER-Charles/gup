import type { MenuState } from "../../../../commands/menu-state.js";
import { FILTER_VIEW } from "../../../text/options-labels.js";
import { ListCursor } from "../../../tui/list-cursor.js";
import type { KeyPress } from "../../../tui/screen-host.js";
import { fillLine, fit, seg, wrap, type Line } from "../../../tui/styled-lines.js";
import type { Viewport } from "../../panel.js";
import type { OptionsView } from "../option-row.js";

export interface ProviderFilterDeps {
  /** The session's filter and the providers the last scan detected. */
  readonly state: MenuState;
  /** The filter changed (already applied to `state.filter`). */
  changed(filter: readonly string[]): void;
  close(): void;
}

const NAME_WIDTH = 30;
const BACK_KEYS: ReadonlySet<string> = new Set(["return", "enter", "escape", "left"]);

/**
 * Which providers the menu's scans include: the detected providers, each
 * checked or not; none checked means all of them.
 */
export class ProviderFilter implements OptionsView {
  readonly title = FILTER_VIEW.title;
  readonly #deps: ProviderFilterDeps;
  #cursor = 0;

  constructor(deps: ProviderFilterDeps) {
    this.#deps = deps;
  }

  hints(): string {
    return FILTER_VIEW.hints;
  }

  render(viewport: Viewport): readonly Line[] {
    const { providers, filter } = this.#deps.state;
    const heading: Line = [seg(FILTER_VIEW.heading, "strong")];
    if (providers.length === 0) {
      const empty = wrap(FILTER_VIEW.empty, Math.max(1, viewport.width));
      return [heading, [], ...empty.map((part): Line => [seg(part, "muted")])];
    }
    const cursor = new ListCursor(
      providers.map(() => true),
      this.#cursor,
    );
    const { start, end } = cursor.window(Math.max(1, viewport.height - 1));
    const rows = providers.slice(start, end).map((provider, offset): Line => {
      const isOn = filter.includes(provider.id);
      const isCursor = start + offset === this.#cursor;
      const line: Line = [
        seg(isCursor ? "› " : "  ", "accent"),
        seg(isOn ? "[■] " : "[ ] ", isOn ? "success" : "muted"),
        seg(fit(provider.displayName, NAME_WIDTH)),
        seg(provider.id, "muted"),
      ];
      return isCursor ? fillLine(line, viewport.width, "highlight") : line;
    });
    return [heading, ...rows];
  }

  press(key: KeyPress): void {
    const last = this.#deps.state.providers.length - 1;
    if (key.name === "up" || key.name === "k") this.#cursor = Math.max(0, this.#cursor - 1);
    else if (key.name === "down" || key.name === "j") {
      this.#cursor = Math.max(0, Math.min(last, this.#cursor + 1));
    } else if (key.name === "space") this.toggle();
    else if (key.name === "a") this.toggleAll();
    else if (BACK_KEYS.has(key.name)) this.#deps.close();
  }

  click(row: number, viewport: Viewport): void {
    const providers = this.#deps.state.providers;
    const { start } = new ListCursor(
      providers.map(() => true),
      this.#cursor,
    ).window(Math.max(1, viewport.height - 1));
    const index = start + row - 1;
    if (row < 1 || index >= providers.length) return;
    this.#cursor = index;
    this.toggle();
  }

  private toggle(): void {
    const { state } = this.#deps;
    const id = state.providers[this.#cursor]?.id;
    if (!id) return;
    const isOn = state.filter.includes(id);
    this.apply(isOn ? state.filter.filter((other) => other !== id) : [...state.filter, id]);
  }

  private toggleAll(): void {
    const { state } = this.#deps;
    const isAll = state.filter.length === state.providers.length;
    this.apply(isAll ? [] : state.providers.map((provider) => provider.id));
  }

  private apply(filter: string[]): void {
    this.#deps.state.filter = filter;
    this.#deps.changed(filter);
  }
}
