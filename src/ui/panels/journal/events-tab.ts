import type { HistoryEvent } from "../../../core/history/types.js";
import { EVENT_LABELS, JOURNAL_HINTS } from "../../text/journal-labels.js";
import type { KeyPress } from "../../tui/screen-host.js";
import { seg, type Line } from "../../tui/styled-lines.js";
import { placeholder } from "../panel.js";
import { BrowsableList } from "./browsable-list.js";
import { detailView } from "./detail-lines.js";
import { eventDetail, eventRow, eventSearchText } from "./event-line.js";
import type { JournalData, JournalHistory } from "./journal-source.js";
import {
  clickRow,
  filterLine,
  historyPlaceholder,
  listHints,
  listWindow,
  nextOf,
  recordingBanner,
  type JournalTab,
  type TabFrame,
} from "./journal-tab.js";

/**
 * Tab 3, Événements: every scan and update attempt of the period, newest
 * first; `f` cycles the type shown, `/` filters on provider, package,
 * status or message, Entrée opens the full record.
 */

type EventType = keyof typeof EVENT_LABELS.types;

const EVENT_TYPES: readonly EventType[] = ["all", "updates", "failures", "skips", "scans"];

const IN_TYPE: Readonly<Record<EventType, (event: HistoryEvent) => boolean>> = {
  all: () => true,
  updates: (event) => event.kind === "update",
  failures: (event) => event.kind === "update" && event.status === "failed",
  skips: (event) => event.kind === "update" && event.status === "skipped",
  scans: (event) => event.kind === "scan",
};

export class EventsTab implements JournalTab {
  readonly #list = new BrowsableList<HistoryEvent>({ searchText: eventSearchText });
  #history: JournalHistory | null = null;
  #type: EventType = "all";

  get isModal(): boolean {
    return this.#list.isModal;
  }

  get isCapturingText(): boolean {
    return this.#list.isTyping;
  }

  setData(data: JournalData): void {
    this.#history = data.history;
    this.#list.setItems(data.history.events);
  }

  render(frame: TabFrame): Line[] {
    const history = this.#history;
    if (!history) return [];
    const notice = historyPlaceholder(history);
    if (notice) return [...recordingBanner(history, frame.width), ...notice];
    const current = this.#list.current;
    if (this.#list.isDetailOpen && current) {
      const { title, body } = eventDetail(current, frame);
      return detailView(title, body, { list: this.#list, height: frame.height });
    }
    const head = this.headLines(history, frame.width);
    const height = frame.height - head.length;
    const rows = listWindow(this.#list, eventRow, { width: frame.width, height });
    return [...head, ...(rows.length > 0 ? rows : placeholder(EVENT_LABELS.noMatch))];
  }

  press(key: KeyPress): boolean {
    if (!this.#list.isModal && key.name === "f") {
      this.#type = nextOf(EVENT_TYPES, this.#type);
      this.#list.setScope(IN_TYPE[this.#type]);
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
    return listHints(this.#list, JOURNAL_HINTS.events);
  }

  /** The banner, the type and count line, then the filter being typed. */
  private headLines(history: JournalHistory, width: number): Line[] {
    const type = EVENT_LABELS.type(EVENT_LABELS.types[this.#type]);
    const count = EVENT_LABELS.count(this.#list.visible.length);
    const summary: Line = [seg(`${type} · ${count}`, "muted")];
    return [...recordingBanner(history, width), summary, ...filterLine(this.#list)];
  }
}
