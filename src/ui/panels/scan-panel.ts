import { formatDuration } from "../text/format.js";
import { NO_SCAN_YET } from "../text/menu-labels.js";
import { STATUS_GLYPHS } from "../theme/glyphs.js";
import type { KeyPress } from "../tui/screen-host.js";
import { fit, seg, wrapLine, type Line } from "../tui/styled-lines.js";
import { PAGE_STEP, placeholder, type Panel, type Viewport } from "./panel.js";

/** What a scan reports as it goes — to a screen, or to nobody. */
export interface ScanEvents {
  detecting(): void;
  planned(total: number): void;
  started(provider: string): void;
  finished(provider: string, outcome: ProviderOutcome): void;
  completed(elapsedMs: number): void;
}

export interface ProviderOutcome {
  readonly updates: number;
  readonly ms: number;
  readonly error?: string;
}

/** A screen following scans as they run: their events, a failure, animation frames. */
export interface ScanObserver extends ScanEvents {
  /** The scan itself broke (not one provider). */
  failed(message: string): void;
  /** One animation frame while the scan runs. */
  tick(): void;
}

/** For non-interactive runs: the scan reports, nobody draws. */
export const SILENT_SCAN: ScanEvents = {
  detecting() {},
  planned() {},
  started() {},
  finished() {},
  completed() {},
};

type Phase = "idle" | "detecting" | "scanning" | "done";

interface Progress {
  readonly name: string;
  readonly outcome?: ProviderOutcome;
}

const SPINNER = STATUS_GLYPHS.running;
const DONE = `${STATUS_GLYPHS.success} `;
const FAILED = `${STATUS_GLYPHS.failed} `;
const BAR_WIDTH = 30;
/** What comes before the name: "  √ ". */
const MARK_WIDTH = 4;
/** The name and result columns on a wide panel, their trailing blank included. */
const NAME_WIDTH = 30;
const RESULT_WIDTH = 34;
/** Narrowest they get: a provider name stays recognisable, "12 mise(s) à jour" whole. */
const MIN_NAME_WIDTH = 12;
const MIN_RESULT_WIDTH = 18;
/** Right-aligned duration column: "2 min 05 s" plus a leading gap. */
const TIME_WIDTH = 11;

/** Widths of the name and result columns, each ending with a blank. */
interface Columns {
  readonly name: number;
  readonly result: number;
}

/**
 * Live progress of a scan, then its result per provider: what is running,
 * what came back with updates, what failed and how long each one took.
 */
export class ScanPanel implements Panel, ScanEvents {
  readonly title = "Scan";
  readonly isCapturingText = false;
  #phase: Phase = "idle";
  #total = 0;
  #elapsedMs = 0;
  #frame = 0;
  #offset = 0;
  #failure: string | null = null;
  readonly #providers = new Map<string, Progress>();
  readonly #onRescan: () => void;

  constructor(onRescan: () => void) {
    this.#onRescan = onRescan;
  }

  get isRunning(): boolean {
    return this.#phase === "detecting" || this.#phase === "scanning";
  }

  detecting(): void {
    this.#phase = "detecting";
    this.#failure = null;
    this.#providers.clear();
    this.#offset = 0;
  }

  planned(total: number): void {
    this.#phase = "scanning";
    this.#total = total;
  }

  started(provider: string): void {
    this.#providers.set(provider, { name: provider });
  }

  finished(provider: string, outcome: ProviderOutcome): void {
    this.#providers.set(provider, { name: provider, outcome });
  }

  completed(elapsedMs: number): void {
    this.#phase = "done";
    this.#elapsedMs = elapsedMs;
  }

  /** The scan itself broke (not one provider): say so instead of pretending it finished. */
  failed(message: string): void {
    this.#phase = "done";
    this.#failure = message;
  }

  /** Advance the spinner; the owner calls it on a timer while the scan runs. */
  tick(): void {
    this.#frame++;
  }

  hints(): string {
    return this.isRunning ? "scan en cours…" : "r rescanner · ↑↓ défiler";
  }

  render(viewport: Viewport): readonly Line[] {
    if (this.#phase === "idle") return placeholder(NO_SCAN_YET);
    const head = [...this.headLines(viewport.width), []];
    const rows = this.sortedRows().slice(
      this.#offset,
      this.#offset + viewport.height - head.length,
    );
    const columns = columnsFor(viewport.width);
    const spinner = this.spinner();
    return [...head, ...rows.map((row) => progressLine(row, columns, spinner))];
  }

  press(key: KeyPress): void {
    if (key.name === "r" && !this.isRunning) this.#onRescan();
    else if (key.name === "up" || key.name === "k") this.scroll(-1);
    else if (key.name === "down" || key.name === "j") this.scroll(1);
    else if (key.name === "pageup") this.scroll(-PAGE_STEP);
    else if (key.name === "pagedown") this.scroll(PAGE_STEP);
  }

  click(): void {}

  scroll(step: number): void {
    this.#offset = Math.max(0, Math.min(this.#offset + step, this.#providers.size - 1));
  }

  /**
   * The headline on as many rows as `width` needs once the scan is over: at
   * 80 columns the summary and a failure's reason are never cut. The
   * progress bar of a running scan stays on its one row.
   */
  private headLines(width: number): Line[] {
    const headline = this.headline();
    return this.#phase === "done" ? wrapLine(headline, width) : [headline];
  }

  private headline(): Line {
    if (this.#failure)
      return [seg(FAILED, "danger"), seg(`Scan interrompu : ${this.#failure}`, "danger")];
    if (this.#phase === "detecting") {
      return [seg(this.spinner(), "accent"), seg("  détection des providers…")];
    }
    const done = [...this.#providers.values()].filter((p) => p.outcome).length;
    if (this.#phase === "done") {
      const updates = [...this.#providers.values()].reduce(
        (n, p) => n + (p.outcome?.updates ?? 0),
        0,
      );
      return [
        seg(DONE, "success"),
        seg(`Scan terminé en ${formatDuration(this.#elapsedMs)}`, "strong"),
        seg(` — ${this.#total} provider(s), ${updates} mise(s) à jour`, "muted"),
      ];
    }
    const filled = this.#total > 0 ? Math.round((done / this.#total) * BAR_WIDTH) : 0;
    return [
      seg(this.spinner(), "accent"),
      seg(`  scan ${done}/${this.#total}  `, "strong"),
      seg("█".repeat(filled), "success"),
      seg("░".repeat(BAR_WIDTH - filled), "muted"),
    ];
  }

  /** Running first, then failures, then providers with updates, then the rest. */
  private sortedRows(): Progress[] {
    const rank = (p: Progress): number => {
      if (!p.outcome) return 0;
      if (p.outcome.error) return 1;
      return p.outcome.updates > 0 ? 2 : 3;
    };
    return [...this.#providers.values()].sort(
      (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
    );
  }

  private spinner(): string {
    return SPINNER[this.#frame % SPINNER.length] ?? "";
  }
}

/**
 * The columns `width` holds with the duration in view: the result shrinks
 * first, then the name, each down to its minimum — narrower than that, the
 * row runs past the panel.
 */
function columnsFor(width: number): Columns {
  const room = width - MARK_WIDTH - TIME_WIDTH;
  const result = Math.min(RESULT_WIDTH, Math.max(MIN_RESULT_WIDTH, room - NAME_WIDTH));
  return { name: Math.min(NAME_WIDTH, Math.max(MIN_NAME_WIDTH, room - result)), result };
}

/** A provider's row: the spinner while it runs, then its outcome and time. */
function progressLine({ name, outcome }: Progress, columns: Columns, spinner: string): Line {
  const nameCell = seg(cell(name, columns.name));
  if (!outcome) return [seg(`  ${spinner} `, "accent"), nameCell, seg("en cours…", "muted")];
  const time = seg(formatDuration(outcome.ms).padStart(TIME_WIDTH), "muted");
  if (outcome.error) {
    return [
      seg(`  ${FAILED}`, "danger"),
      nameCell,
      seg(cell(outcome.error, columns.result), "danger"),
      time,
    ];
  }
  const result = outcome.updates > 0 ? `${outcome.updates} mise(s) à jour` : "à jour";
  return [
    seg(`  ${DONE}`, "success"),
    nameCell,
    seg(cell(result, columns.result), outcome.updates > 0 ? "warning" : "muted"),
    time,
  ];
}

/** `text` cut to `width` columns with one blank kept at the end, so cells never touch. */
function cell(text: string, width: number): string {
  return `${fit(text, width - 1)} `;
}
