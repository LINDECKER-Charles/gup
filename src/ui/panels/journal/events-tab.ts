import type { HistoryEvent } from "../../../core/history/types.js";
import type { ProviderName } from "../../charts/activity-sections.js";
import { EVENT_LABELS, JOURNAL_HINTS } from "../../text/journal/journal-labels.js";
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
 * Tab 3, Events: every scan and update attempt of the period, newest
 * first; `f` cycles the type shown, `/` filters on provider, package,
 * status or message, Enter opens the full record.
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

export interface EventsTabNames {
  /** A provider's display name from its id: rows, details and the `/` filter. */
  readonly providerName: ProviderName;
  /** A schedule's name from its id, for the detail (unknown ids show as such). */
  readonly scheduleName?: ((scheduleId: string) => string | undefined) | undefined;
}

export class EventsTab implements JournalTab {
  readonly #list: BrowsableList<HistoryEvent>;
  readonly #names: EventsTabNames;
  #history: JournalHistory | null = null;
  #type: EventType = "all";

  constructor(names: EventsTabNames) {
    this.#names = names;
    this.#list = new BrowsableList<HistoryEvent>({
      searchText: (event) => eventSearchText(event, names.providerName),
    });
  }

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
      const context = { ...frame, ...this.#names };
      const { title, body } = eventDetail(current, context);
      return detailView(title, body, { list: this.#list, ...frame });
    }
    const head = this.headLines(history, frame.width);
    const height = frame.height - head.length;
    const row = (event: HistoryEvent, width: number) =>
      eventRow(event, width, this.#names.providerName);
    const rows = listWindow(this.#list, row, { width: frame.width, height });
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
