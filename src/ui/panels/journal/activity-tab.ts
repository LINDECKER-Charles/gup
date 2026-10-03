import type { Insights } from "../../../core/insights/types.js";
import {
  heatmapSection,
  kpiLines,
  slowProvidersLine,
  trendLine,
} from "../../charts/activity-sections.js";
import { JOURNAL_HINTS } from "../../text/journal-labels.js";
import type { Line } from "../../tui/styled-lines.js";
import type { JournalData } from "./journal-source.js";
import {
  historyPlaceholder,
  recordingBanner,
  type JournalTab,
  type TabFrame,
} from "./journal-tab.js";

/**
 * Tab 1, Activité: the period at a glance — headline numbers, the calendar
 * heatmap of successful updates, the outdated trend, the slowest scans. On a
 * short panel the blank lines between blocks go first, then the last blocks.
 */
export class ActivityTab implements JournalTab {
  readonly isModal = false;
  readonly isCapturingText = false;
  #data: JournalData | null = null;

  setData(data: JournalData): void {
    this.#data = data;
  }

  render(frame: TabFrame): Line[] {
    const history = this.#data?.history;
    if (!history) return [];
    const banner = recordingBanner(history, frame.width);
    const notice = historyPlaceholder(history);
    if (notice) return [...banner, ...notice];
    return [...banner, ...stack(blocksOf(history.insights, frame), frame.height - banner.length)];
  }

  press(): boolean {
    return false;
  }

  click(): void {}

  scroll(): void {}

  hints(): string {
    return JOURNAL_HINTS.activity;
  }
}

function blocksOf(insights: Insights, frame: TabFrame): Line[][] {
  return [
    kpiLines(insights, frame),
    heatmapSection(insights, frame),
    [trendLine(insights, frame)],
    [slowProvidersLine(insights, frame)],
  ];
}

/**
 * The blocks in order, a blank line between them when everything fits that
 * way; without the blank lines otherwise, and as many blocks as fit.
 */
function stack(blocks: readonly Line[][], height: number): Line[] {
  const spaced = blocks.flatMap((block, index) => (index === 0 ? block : [[], ...block]));
  if (spaced.length <= height) return spaced;
  const lines: Line[] = [];
  for (const block of blocks) {
    if (lines.length + block.length > height) break;
    lines.push(...block);
  }
  return lines;
}
