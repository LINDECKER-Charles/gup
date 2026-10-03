import { getInstallTimeoutSeconds } from "../../core/runner.js";
import type { MenuState } from "../../commands/menu-state.js";
import { ListCursor } from "../tui/list-cursor.js";
import type { KeyPress } from "../tui/screen-host.js";
import { fillLine, fit, seg, type Line } from "../tui/styled-lines.js";
import { type Panel, type Viewport } from "./panel.js";

export interface OptionsHandlers {
  onEditTimeout(): void;
  onRescan(): void;
}

type Row = "fast" | "timeout" | "filter";
const ROWS: readonly Row[] = ["fast", "timeout", "filter"];
const LABEL_WIDTH = 18;
const VALUE_WIDTH = 15;

/**
 * Scan and install settings. The provider filter opens in place as a list of
 * the detected providers to check; settings that change what a scan finds
 * apply on the next scan, which the panel offers to run.
 */
export class OptionsPanel implements Panel {
  readonly title = "Options";
  readonly isCapturingText = false;
  readonly #state: MenuState;
  readonly #handlers: OptionsHandlers;
  #row = 0;
  #filterCursor: number | null = null;
  #isDirty = false;

  constructor(state: MenuState, handlers: OptionsHandlers) {
    this.#state = state;
    this.#handlers = handlers;
  }

  hints(): string {
    if (this.#filterCursor !== null)
      return "↑↓ naviguer · espace cocher · a tout · entrée/échap retour";
    return `↑↓ naviguer · entrée modifier${this.#isDirty ? " · r rescanner" : ""}`;
  }

  render(viewport: Viewport): readonly Line[] {
    if (this.#filterCursor !== null) return this.filterLines(viewport);
    const lines = ROWS.map((row, i): Line => {
      const isCursor = i === this.#row;
      const line: Line = [seg(isCursor ? "› " : "  ", "accent"), ...this.settingLine(row)];
      return isCursor ? fillLine(line, viewport.width, "highlight") : line;
    });
    if (!this.#isDirty) return lines;
    return [
      ...lines,
      [],
      [seg("  Réglages modifiés — r pour rescanner avec ces réglages.", "warning")],
    ];
  }

  press(key: KeyPress): void {
    if (this.#filterCursor !== null) return this.pressInFilter(key);
    if (key.name === "up" || key.name === "k") this.#row = Math.max(0, this.#row - 1);
    else if (key.name === "down" || key.name === "j")
      this.#row = Math.min(ROWS.length - 1, this.#row + 1);
    else if (key.name === "r" && this.#isDirty) this.rescan();
    else if (["return", "enter", "space"].includes(key.name)) this.activate(ROWS[this.#row]);
  }

  click(row: number): void {
    if (this.#filterCursor !== null) {
      this.#filterCursor = Math.max(0, row - 1);
      return this.toggleProvider();
    }
    if (row >= ROWS.length) return;
    this.#row = row;
    this.activate(ROWS[row]);
  }

  scroll(step: number): void {
    this.press({ name: step < 0 ? "up" : "down", ctrl: false, sequence: "" });
  }

  private activate(row: Row | undefined): void {
    if (row === "fast") {
      this.#state.fast = !this.#state.fast;
      this.#isDirty = true;
    } else if (row === "timeout") {
      this.#handlers.onEditTimeout();
    } else if (row === "filter") {
      this.#filterCursor = 0;
    }
  }

  private rescan(): void {
    this.#isDirty = false;
    this.#handlers.onRescan();
  }

  private settingLine(row: Row): Line {
    const timeout = getInstallTimeoutSeconds();
    const specs: Record<Row, [string, string, string]> = {
      fast: [
        "Mode rapide",
        this.#state.fast ? "ON" : "OFF",
        "ignore les providers lents (pwsh-modules, vscode-ext…)",
      ],
      timeout: [
        "Timeout install",
        timeout > 0 ? `${timeout}s` : "OFF",
        "une install bloquée au-delà est ignorée",
      ],
      filter: ["Filtre providers", this.filterLabel(), "limiter le scan à certains providers"],
    };
    const [label, value, hint] = specs[row];
    return [
      seg(fit(label, LABEL_WIDTH)),
      seg(fit(`[${value}]`, VALUE_WIDTH), "accent"),
      seg(hint, "muted"),
    ];
  }

  private filterLabel(): string {
    const count = this.#state.filter.length;
    return count === 0 ? "tous" : `${count} choisi(s)`;
  }

  private filterLines(viewport: Viewport): Line[] {
    const providers = this.#state.providers;
    const cursor = new ListCursor(
      providers.map(() => true),
      this.#filterCursor ?? 0,
    );
    const { start, end } = cursor.window(Math.max(1, viewport.height - 1));
    const rows = providers.slice(start, end).map((p, offset): Line => {
      const isOn = this.#state.filter.includes(p.id);
      const isCursor = start + offset === this.#filterCursor;
      const line: Line = [
        seg(isCursor ? "› " : "  ", "accent"),
        seg(isOn ? "[■] " : "[ ] ", isOn ? "success" : "muted"),
        seg(fit(p.displayName, 30)),
        seg(p.id, "muted"),
      ];
      return isCursor ? fillLine(line, viewport.width, "highlight") : line;
    });
    return [[seg("Providers à inclure — aucun coché = tous", "strong")], ...rows];
  }

  private pressInFilter(key: KeyPress): void {
    const last = this.#state.providers.length - 1;
    const at = this.#filterCursor ?? 0;
    if (key.name === "up" || key.name === "k") this.#filterCursor = Math.max(0, at - 1);
    else if (key.name === "down" || key.name === "j") this.#filterCursor = Math.min(last, at + 1);
    else if (key.name === "space") this.toggleProvider();
    else if (key.name === "a") this.toggleAllProviders();
    else if (["return", "enter", "escape"].includes(key.name)) this.#filterCursor = null;
  }

  private toggleProvider(): void {
    const id = this.#state.providers[this.#filterCursor ?? 0]?.id;
    if (!id) return;
    const filter = this.#state.filter;
    this.#state.filter = filter.includes(id) ? filter.filter((f) => f !== id) : [...filter, id];
    this.#isDirty = true;
  }

  private toggleAllProviders(): void {
    const isAll = this.#state.filter.length === this.#state.providers.length;
    this.#state.filter = isAll ? [] : this.#state.providers.map((p) => p.id);
    this.#isDirty = true;
  }
}
