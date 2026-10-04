import { levelRank, type LogRecord } from "../../../core/log/types.js";
import { levelLabel, logRecordLine, printable, recordTime } from "../../log-line.js";
import { DEBUG_LABELS, EVENT_LABELS, JOURNAL_HINTS } from "../../text/journal/journal-labels.js";
import { LOG_SOURCE_LABELS, thresholdLabel } from "../../text/journal/log-labels.js";
import type { KeyPress } from "../../tui/screen-host.js";
import { fit, seg, wrap, type Line } from "../../tui/styled-lines.js";
import { placeholder } from "../panel.js";
import { BrowsableList } from "./browsable-list.js";
import { detailView, fieldLines, indentedLines, type DetailField } from "./detail-lines.js";
import type { JournalData, JournalLog } from "./journal-source.js";
import {
  clickRow,
  filterLine,
  listHints,
  listWindow,
  nextOf,
  type JournalTab,
  type TabFrame,
} from "./journal-tab.js";

/**
 * Tab 4, Debug: the newest records of the debug log, newest first, one line
 * each. `l` steps the level shown (never the level written: that is
 * `--log-level`, `GUP_LOG_LEVEL` or Options › Debug log, shown in the
 * header), `/` filters, Enter shows a record's context and data, `x` writes
 * the diagnostic archive.
 */

type LevelFilter = keyof typeof DEBUG_LABELS.levels;

const LEVEL_FILTERS: readonly LevelFilter[] = ["all", "debug", "info", "warn", "error"];
const SESSION_ID_LENGTH = 8;
const JSON_INDENT = 2;
/** The data block sits under its title by this much. */
const DATA_INDENT = "  ";
const LEADING_SPACES = /^ */;

export interface DebugTabActions {
  /** `x`: write the diagnostic archive. */
  readonly onDiagnostic: () => void;
}

export class DebugTab implements JournalTab {
  readonly #list = new BrowsableList<LogRecord>({ searchText: searchTextOf });
  readonly #actions: DebugTabActions;
  #data: JournalData | null = null;
  #level: LevelFilter = "all";

  constructor(actions: DebugTabActions) {
    this.#actions = actions;
  }

  get isModal(): boolean {
    return this.#list.isModal;
  }

  get isCapturingText(): boolean {
    return this.#list.isTyping;
  }

  setData(data: JournalData): void {
    this.#data = data;
    this.#list.setItems(data.log.records);
  }

  render(frame: TabFrame): Line[] {
    const data = this.#data;
    if (!data) return [];
    const current = this.#list.current;
    if (this.#list.isDetailOpen && current) {
      const body = detailBody(current, frame.width);
      return detailView(detailTitle(current), body, { list: this.#list, ...frame });
    }
    const head = this.headLines(data.log, frame.width);
    const foot = footLines(data);
    const height = frame.height - head.length - foot.length;
    const rows = listWindow(this.#list, logRecordLine, { width: frame.width, height });
    return [...head, ...(rows.length > 0 ? rows : this.emptyLines(data.log)), ...foot];
  }

  press(key: KeyPress): boolean {
    if (this.#list.isModal) return this.#list.press(key);
    if (key.name === "l") {
      this.#level = nextOf(LEVEL_FILTERS, this.#level);
      const least = this.#level === "all" ? null : this.#level;
      this.#list.setScope(
        (record) => least === null || levelRank(record.level) <= levelRank(least),
      );
      return true;
    }
    if (key.name === "x") {
      this.#actions.onDiagnostic();
      return true;
    }
    return this.#list.press(key);
  }

  click(row: number, frame: TabFrame): void {
    const head = this.#data ? this.headLines(this.#data.log, frame.width).length : 0;
    clickRow(this.#list, row - head, frame.height - head);
  }

  scroll(step: number): void {
    this.#list.scroll(step);
  }

  hints(): string {
    return listHints(this.#list, JOURNAL_HINTS.debug);
  }

  /** The level shown, the level written and its source, the count; the off notice; the filter. */
  private headLines(log: JournalLog, width: number): Line[] {
    const parts = [
      DEBUG_LABELS.level(DEBUG_LABELS.levels[this.#level]),
      DEBUG_LABELS.writing(thresholdLabel(log.threshold), LOG_SOURCE_LABELS[log.source]),
      DEBUG_LABELS.count(this.#list.visible.length),
    ];
    const summary: Line = [seg(fit(parts.join(" · "), width).trimEnd(), "muted")];
    return [summary, ...offNotice(log, width), ...filterLine(this.#list)];
  }

  private emptyLines(log: JournalLog): Line[] {
    if (log.error !== undefined) return placeholder(DEBUG_LABELS.unreadable(log.error));
    return placeholder(log.records.length > 0 ? DEBUG_LABELS.noMatch : DEBUG_LABELS.empty);
  }
}

/**
 * Said above the list while this run writes no log (older records may still
 * show). The hint wraps: an 80-column terminal leaves the panel 50.
 */
function offNotice(log: JournalLog, width: number): Line[] {
  if (log.threshold !== "off") return [];
  const hint = wrap(DEBUG_LABELS.offHint[log.source], width);
  return [[seg(DEBUG_LABELS.off, "warning")], ...hint.map((text): Line => [seg(text, "muted")])];
}

function searchTextOf(record: LogRecord): string {
  return logRecordLine(record).map((segment) => segment.text).join("");
}

/** What the log and the history could not read, under the list. */
function footLines({ history, log }: JournalData): Line[] {
  const { malformed, unsupported } = history.stats;
  const notes = [
    ...(malformed > 0 ? [DEBUG_LABELS.historySkipped(malformed)] : []),
    ...(unsupported > 0 ? [DEBUG_LABELS.historyNewer(unsupported)] : []),
    ...(log.malformed > 0 ? [DEBUG_LABELS.logSkipped(log.malformed)] : []),
  ];
  return notes.map((note): Line => [seg(note, "muted")]);
}

function detailTitle(record: LogRecord): Line {
  return [seg(`${levelLabel(record.level)} `, "strong"), seg(record.event, "strong")];
}

function detailBody(record: LogRecord, width: number): Line[] {
  const { ctx } = record;
  const scope = ctx ? [ctx.op, ctx.providerId, ctx.packageId].filter(Boolean) : [];
  const fields: DetailField[] = [
    // Local time, as the list shows it, then the instant as the log file holds it.
    [DEBUG_LABELS.time, `${recordTime(record.ts)} (${record.ts})`],
    [DEBUG_LABELS.levelField, levelLabel(record.level)],
    [DEBUG_LABELS.event, record.event],
    [DEBUG_LABELS.context, scope.length > 0 ? scope.join(" · ") : undefined],
    [DEBUG_LABELS.process, String(record.pid)],
    [DEBUG_LABELS.session, record.runId.slice(0, SESSION_ID_LENGTH)],
    [DEBUG_LABELS.elevated, record.elevated ? EVENT_LABELS.yes : undefined],
  ];
  return [...fieldLines(fields, width), ...dataLines(record.data, width)];
}

/**
 * The record's data as indented JSON, each line made printable, its
 * indentation kept, a long value (a command's error output) wrapped under it.
 */
function dataLines(data: LogRecord["data"], width: number): Line[] {
  if (data === undefined) return [];
  const json = JSON.stringify(data, null, JSON_INDENT).split("\n");
  return [
    [],
    [seg(DEBUG_LABELS.data, "strong")],
    ...json.flatMap((line) => {
      const indent = LEADING_SPACES.exec(line)?.[0] ?? "";
      return indentedLines(printable(line.slice(indent.length)), `${DATA_INDENT}${indent}`, width);
    }),
  ];
}
