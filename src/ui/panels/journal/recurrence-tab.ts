import type { PackageRecurrence } from "../../../core/insights/types.js";
import {
  recurrenceColumns,
  recurrenceHeader,
  recurrenceRow,
} from "../../charts/recurrence-table.js";
import {
  CADENCE_DESCRIPTIONS,
  intervalLabel,
} from "../../text/activity-labels.js";
import { formatCount, formatDate, formatRelative } from "../../text/fr-format.js";
import { JOURNAL_HINTS, RECURRENCE_LABELS } from "../../text/journal-labels.js";
import type { KeyPress } from "../../tui/screen-host.js";
import { fit, seg, type Line } from "../../tui/styled-lines.js";
import { placeholder } from "../panel.js";
import { BrowsableList } from "./browsable-list.js";
import { detailView, fieldLines, type DetailField } from "./detail-lines.js";
import type { JournalData, JournalHistory } from "./journal-source.js";
import {
  CURSOR_GUTTER,
  clickRow,
  historyPlaceholder,
  listHints,
  listWindow,
  nextOf,
  recordingBanner,
  type JournalTab,
  type TabFrame,
} from "./journal-tab.js";

/**
 * Tab 2, Récurrence: which packages get updated, how often and at which pace
 * — a bar per package, its typical interval and cadence. `s` cycles the
 * order (most updated, most failed, most recent); Entrée opens a package:
 * its counts, pace, first and last attempt, latest versions.
 */

type SortMode = keyof typeof RECURRENCE_LABELS.sorts;

const SORT_MODES: readonly SortMode[] = ["frequency", "failures", "recent"];

const ORDER: Readonly<Record<SortMode, (a: PackageRecurrence, b: PackageRecurrence) => number>> = {
  // The insights come most updated first already.
  frequency: () => 0,
  failures: (a, b) => b.failures - a.failures,
  recent: (a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0),
};

export class RecurrenceTab implements JournalTab {
  readonly #list = new BrowsableList<PackageRecurrence>();
  #history: JournalHistory | null = null;
  #sort: SortMode = "frequency";

  get isModal(): boolean {
    return this.#list.isModal;
  }

  readonly isCapturingText = false;

  setData(data: JournalData): void {
    this.#history = data.history;
    this.applySort();
  }

  render(frame: TabFrame): Line[] {
    const history = this.#history;
    if (!history) return [];
    const notice = historyPlaceholder(history);
    if (notice) return [...recordingBanner(history, frame.width), ...notice];
    const current = this.#list.current;
    if (this.#list.isDetailOpen && current) {
      const body = detailBody(current, frame);
      return detailView(detailTitle(current), body, { list: this.#list, height: frame.height });
    }
    if (this.#list.visible.length === 0) return placeholder(RECURRENCE_LABELS.empty);
    const head = this.headLines(history, frame.width);
    return [...head, ...this.rows({ ...frame, height: frame.height - head.length })];
  }

  press(key: KeyPress): boolean {
    if (!this.#list.isModal && key.name === "s") {
      this.#sort = nextOf(SORT_MODES, this.#sort);
      this.applySort();
      return true;
    }
    return this.#list.press(key);
  }

  click(row: number, frame: TabFrame): void {
    const head = this.#history ? this.headLines(this.#history, frame.width).length : 0;
    clickRow(this.#list, row - head, frame.height - head);
  }

  scroll(step: number): void {
    this.#list.scroll(step);
  }

  hints(): string {
    return listHints(this.#list, JOURNAL_HINTS.recurrence);
  }

  private applySort(): void {
    const entries = this.#history?.insights.recurrence ?? [];
    this.#list.setItems([...entries].sort(ORDER[this.#sort]));
  }

  /** The banner, the title with the order in effect, the column titles. */
  private headLines(history: JournalHistory, width: number): Line[] {
    const sort = RECURRENCE_LABELS.sort(RECURRENCE_LABELS.sorts[this.#sort]);
    const title = fit(RECURRENCE_LABELS.title, Math.max(0, width - sort.length - 1));
    const columns = recurrenceColumns(width - CURSOR_GUTTER);
    return [
      ...recordingBanner(history, width),
      [seg(`${title} `, "strong"), seg(sort, "muted")],
      [seg(" ".repeat(CURSOR_GUTTER)), ...recurrenceHeader(columns)],
    ];
  }

  private rows(frame: TabFrame): Line[] {
    const columns = recurrenceColumns(frame.width - CURSOR_GUTTER);
    const max = Math.max(1, ...this.#list.visible.map((entry) => entry.successes));
    const context = { columns, max, glyphs: frame.glyphs };
    return listWindow(this.#list, (entry) => recurrenceRow(entry, context), frame);
  }
}

function detailTitle(entry: PackageRecurrence): Line {
  return [seg(entry.packageId, "strong"), seg(` · ${entry.providerId}`, "muted")];
}

function detailBody(entry: PackageRecurrence, frame: TabFrame): Line[] {
  const fields: DetailField[] = [
    [RECURRENCE_LABELS.successes, formatCount(entry.successes)],
    [RECURRENCE_LABELS.failures, formatCount(entry.failures)],
    [RECURRENCE_LABELS.skips, formatCount(entry.skips)],
    [RECURRENCE_LABELS.interval, intervalLabel(entry.medianIntervalDays)],
    [RECURRENCE_LABELS.cadence, CADENCE_DESCRIPTIONS[entry.cadence]],
    [RECURRENCE_LABELS.first, formatRelative(new Date(entry.firstAt), frame.now)],
    [RECURRENCE_LABELS.last, formatRelative(new Date(entry.lastAt), frame.now)],
  ];
  const versions = entry.versions.map((step): Line => [
    seg(`  ${formatDate(new Date(step.at))}  `, "muted"),
    seg(`${step.from ?? "?"} → ${step.to ?? "?"}`),
  ]);
  if (versions.length === 0) return fieldLines(fields, frame.width);
  const title: Line = [seg(RECURRENCE_LABELS.versions, "strong")];
  return [...fieldLines(fields, frame.width), [], title, ...versions];
}
