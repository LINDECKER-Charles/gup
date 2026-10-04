import { JOURNAL_SECTION } from "../../../core/config/journal-section.js";
import { buildInsights } from "../../../core/insights/build-insights.js";
import { withHomeShortened } from "../../../core/log/redact.js";
import {
  nextPeriod,
  parsePeriod,
  presetPeriod,
  type Period,
  type PeriodPreset,
} from "../../../core/time/period.js";
import type { ResultNotice } from "../../app/view-definition.js";
import { chartGlyphs } from "../../charts/chart-glyphs.js";
import type { GlyphMode } from "../../theme/glyphs.js";
import { periodLabel } from "../../text/journal/activity-labels.js";
import { EXPORT_LABELS, JOURNAL_LABELS, TAB_LABELS } from "../../text/journal/journal-labels.js";
import type { ChoiceSpec } from "../../tui/dialog.js";
import type { KeyPress } from "../../tui/screen-host.js";
import {
  fit,
  middleEllipsis,
  seg,
  wrapLine,
  type Line,
  type Segment,
} from "../../tui/styled-lines.js";
import { placeholder, type Panel, type Viewport } from "../panel.js";
import { ActivityTab } from "./activity-tab.js";
import { DebugTab } from "./debug-tab.js";
import { EventsTab } from "./events-tab.js";
import type { ExportFormat, ExportOutcome, JournalData, JournalSource } from "./journal-source.js";
import type { JournalTab, TabFrame } from "./journal-tab.js";
import { RecurrenceTab } from "./recurrence-tab.js";

/**
 * The Journal view: four tabs over one load of the period — Activité,
 * Récurrence, Événements, Debug — switched with 1-4 or [ ]. `p` steps the
 * period, `r` reloads, `o` writes the HTML report of the period (opened in
 * the browser when the setting says so), `e` exports. The period is the
 * `journal.period` setting until `p` picks one. A load never blanks the
 * screen: the previous data stays until the new one arrives (the title shows
 * ↻), and a load overtaken by a newer one is dropped.
 */

export interface JournalPanelDeps {
  readonly source: JournalSource;
  readonly redraw: () => void;
  readonly choose: <T>(spec: ChoiceSpec<T>) => Promise<T | undefined>;
  /** The glyph mode of the screen, read at every draw (it follows the appearance). */
  readonly glyphMode: () => GlyphMode;
  readonly now?: () => Date;
  /**
   * The period the view shows (the `journal.period` setting), read again at
   * each load until `p` picks another one.
   */
  readonly defaultPeriod?: () => PeriodPreset;
  /** A schedule's name from its id, for the event detail; undefined when unknown. */
  readonly scheduleName?: (scheduleId: string) => string | undefined;
}

const DEFAULT_PERIOD = JOURNAL_SECTION.defaults.period;
/** Rows above a tab's content: the tab bar. */
const TAB_BAR_ROWS = 1;
const TAB_GAP = "  ";
/** Keys named by their character rather than by OpenTUI's name. */
const PUNCTUATION: ReadonlySet<string> = new Set(["[", "]"]);
const EXPORT_FORMATS: readonly ExportFormat[] = ["html", "json", "csv", "diagnostic"];

/** What the last line says until the next key: an export running, or how one ended. */
type ExportStatus =
  | { readonly kind: "running" }
  | { readonly kind: "done"; readonly outcome: ExportOutcome };

export class JournalPanel implements Panel {
  readonly #deps: JournalPanelDeps;
  readonly #now: () => Date;
  readonly #tabs: readonly JournalTab[];
  #tabIndex = 0;
  #period: Period;
  /** `p` picked the period: the setting no longer decides it. */
  #isPeriodChosen = false;
  #data: JournalData | null = null;
  #isLoading = false;
  /** Loads started: a result whose number is not the latest is stale. */
  #loadCount = 0;
  #isExporting = false;
  #status: ExportStatus | null = null;

  constructor(deps: JournalPanelDeps) {
    this.#deps = deps;
    this.#now = deps.now ?? (() => new Date());
    this.#period = presetPeriod(this.defaultPeriod(), this.#now());
    this.#tabs = [
      new ActivityTab(),
      new RecurrenceTab(),
      new EventsTab(deps.scheduleName),
      new DebugTab({ onDiagnostic: () => void this.export("diagnostic") }),
    ];
  }

  get title(): string {
    const reloading = this.#isLoading ? JOURNAL_LABELS.reloading : "";
    return `${JOURNAL_LABELS.title(periodLabel(this.#period))}${reloading}`;
  }

  get isCapturingText(): boolean {
    return this.tab.isCapturingText;
  }

  hints(): string {
    return this.tab.hints();
  }

  render(viewport: Viewport): readonly Line[] {
    const bar = tabBar(this.#tabIndex, viewport.width);
    if (!this.#data) return [bar, ...placeholder(JOURNAL_LABELS.loading)];
    const status = this.statusLines(viewport.width);
    const frame = this.frameFor(viewport);
    return [bar, ...this.tab.render(frame).slice(0, frame.height), ...status];
  }

  press(key: KeyPress): void {
    this.#status = null;
    if (this.tab.isModal) {
      this.tab.press(key);
      return;
    }
    const name = PUNCTUATION.has(key.sequence) ? key.sequence : key.name;
    const action = key.ctrl ? undefined : this.panelKeys()[name];
    if (action) action();
    else this.tab.press(key);
  }

  click(row: number, viewport: Viewport): void {
    if (row < TAB_BAR_ROWS || !this.#data) return;
    this.tab.click(row - TAB_BAR_ROWS, this.frameFor(viewport));
  }

  scroll(step: number): void {
    this.tab.scroll(step);
  }

  onShow(): void {
    this.load();
  }

  private get tab(): JournalTab {
    return this.#tabs[this.#tabIndex] as JournalTab;
  }

  private frameFor(viewport: Viewport): TabFrame {
    const statusRows = this.statusLines(viewport.width).length;
    return {
      width: viewport.width,
      height: Math.max(1, viewport.height - TAB_BAR_ROWS - statusRows),
      glyphs: chartGlyphs(this.#deps.glyphMode()),
      now: this.#now(),
    };
  }

  private panelKeys(): Record<string, () => void> {
    const count = this.#tabs.length;
    return {
      ...Object.fromEntries(
        this.#tabs.map((_tab, index) => [String(index + 1), () => this.showTab(index)]),
      ),
      "[": () => this.showTab((this.#tabIndex + count - 1) % count),
      "]": () => this.showTab((this.#tabIndex + 1) % count),
      p: () => {
        this.#period = nextPeriod(this.#period, this.#now());
        this.#isPeriodChosen = true;
        this.load();
      },
      r: () => this.load(),
      o: () => void this.export("html"),
      e: () => void this.chooseExport(),
    };
  }

  private showTab(index: number): void {
    this.#tabIndex = index;
  }

  private defaultPeriod(): PeriodPreset {
    return this.#deps.defaultPeriod?.() ?? DEFAULT_PERIOD;
  }

  /**
   * Load the period afresh (it ends now) — the setting's, until `p` picked
   * one; a load overtaken by a newer one is dropped.
   */
  private load(): void {
    const ticket = ++this.#loadCount;
    const key = this.#isPeriodChosen ? this.#period.key : this.defaultPeriod();
    this.#period = parsePeriod(key, this.#now()) ?? this.#period;
    const period = this.#period;
    this.#isLoading = true;
    this.#deps.redraw();
    void this.fetch(period).then((data) => {
      if (ticket !== this.#loadCount) return;
      this.#data = data;
      this.#isLoading = false;
      for (const tab of this.#tabs) tab.setData(data);
      this.#deps.redraw();
    });
  }

  /** The source never rejects; should it break that promise, the history tabs say why. */
  private async fetch(period: Period): Promise<JournalData> {
    try {
      return await this.#deps.source.load(period);
    } catch (error) {
      return unreadableData(period, error instanceof Error ? error.message : String(error));
    }
  }

  private async chooseExport(): Promise<void> {
    const format = await this.#deps.choose<ExportFormat>({
      title: EXPORT_LABELS.title,
      text: [EXPORT_LABELS.period(periodLabel(this.#period)), "", EXPORT_LABELS.footer],
      choices: EXPORT_FORMATS.map((value) => ({ label: EXPORT_LABELS[value], value })),
    });
    if (format !== undefined) await this.export(format);
    this.#deps.redraw();
  }

  /** One export at a time; its outcome stays on the last line until the next key. */
  private async export(format: ExportFormat): Promise<void> {
    if (this.#isExporting) return;
    this.#isExporting = true;
    this.#status = { kind: "running" };
    this.#deps.redraw();
    const outcome = await this.safeExport(format);
    this.#isExporting = false;
    this.#status = { kind: "done", outcome };
    this.#deps.redraw();
  }

  /** The status, wrapped to the panel: a narrow terminal never cuts the path off. */
  private statusLines(width: number): Line[] {
    const status = this.#status;
    if (!status) return [];
    const { text, tone }: ResultNotice =
      status.kind === "running"
        ? { text: EXPORT_LABELS.running, tone: "muted" }
        : exportNotice(status.outcome, width);
    return wrapLine([seg(text, tone)], width);
  }

  private async safeExport(format: ExportFormat): Promise<ExportOutcome> {
    try {
      return await this.#deps.source.export(format, this.#period);
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

/** "▌1 Activité  2 Récurrence  3 Événements  4 Debug": the current tab marked, not only tinted. */
function tabBar(current: number, width: number): Line {
  const segments: Segment[] = [];
  TAB_LABELS.forEach((label, index) => {
    if (index > 0) segments.push(seg(TAB_GAP));
    const text = `${index + 1} ${label}`;
    if (index === current) segments.push(seg("▌", "accent"), seg(text, "strong"));
    else segments.push(seg(text, "muted"));
  });
  const used = segments.reduce((total, segment) => total + segment.text.length, 0);
  return used <= width ? segments : [seg(fit(segments.map((s) => s.text).join(""), width))];
}

/**
 * Where an export went — written, opened in the browser, written but not
 * opened, or why not — as the line that says it: the Journal's status, and
 * what the run's results say after their `o rapport HTML`. The path reads
 * from `~`; given a `width`, it fits one row of it, cut in its middle when it
 * must be, so the file name always shows.
 */
export function exportNotice(outcome: ExportOutcome, width?: number): ResultNotice {
  if (!outcome.ok) return { text: EXPORT_LABELS.failed(outcome.error), tone: "danger" };
  const home = withHomeShortened(outcome.path);
  const path = width === undefined ? home : middleEllipsis(home, width);
  if (outcome.opened === true) return { text: EXPORT_LABELS.opened(path), tone: "success" };
  if (outcome.opened === false) return { text: EXPORT_LABELS.notOpened(path), tone: "warning" };
  return { text: EXPORT_LABELS.written(path), tone: "success" };
}

function unreadableData(period: Period, error: string): JournalData {
  const stats = { files: 0, lines: 0, malformed: 0, unsupported: 0 };
  const insights = buildInsights([], { period });
  return {
    history: { insights, events: [], stats, error, isRecordingOff: false },
    log: { records: [], threshold: "off", source: "default", malformed: 0, error },
  };
}
