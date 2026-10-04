import { supportLabel } from "../../core/platform/platform-label.js";
import type { ProviderStatusReport, ProviderSummary } from "../../core/platform/types.js";
import { VIEW_LABELS } from "../text/menu-labels.js";
import {
  PROVIDERS_PANEL_LABELS as LABELS,
  providersSummaryParts,
} from "../text/providers-labels.js";
import { STATUS_GLYPHS } from "../theme/glyphs.js";
import type { KeyPress } from "../tui/screen-host.js";
import { fit, seg, wrap, type Line } from "../tui/styled-lines.js";
import { PAGE_STEP, placeholder, type Panel, type Viewport } from "./panel.js";

const NAME_WIDTH = 30;
/** How far an incompatible row's name may shrink so its badge still fits. */
const MIN_NAME_WIDTH = 10;
const COLUMN_GAP = 1;
/** "  – ": indent, glyph and space before an incompatible row's name. */
const ROW_PREFIX_WIDTH = 4;
const NOTE_INDENT = "  ";
const HINT_PREFIX = "      → ";

const SCROLL_STEPS: Readonly<Record<string, number>> = {
  up: -1,
  k: -1,
  down: 1,
  j: 1,
  pageup: -PAGE_STEP,
  pagedown: PAGE_STEP,
};

export interface ProvidersPanelOptions {
  /** Read on every render, so the preference applies live. Default: shown. */
  readonly showIncompatible?: () => boolean;
}

/**
 * Which providers gup found on this machine, how to get the others, and —
 * greyed — the ones that belong to another OS. Detection is slow, so it
 * starts the first time the panel is shown: `load` fetches the report and
 * hands it to {@link setData}.
 */
export class ProvidersPanel implements Panel {
  readonly isCapturingText = false;
  readonly #load: () => void;
  readonly #showIncompatible: () => boolean;
  #isLoadRequested = false;
  #report: ProviderStatusReport | null = null;
  #offset = 0;

  constructor(load: () => void, options: ProvidersPanelOptions = {}) {
    this.#load = load;
    this.#showIncompatible = options.showIncompatible ?? (() => true);
  }

  get title(): string {
    return VIEW_LABELS.providers;
  }

  onShow(): void {
    if (this.#isLoadRequested) return;
    this.#isLoadRequested = true;
    this.#load();
  }

  setData(report: ProviderStatusReport): void {
    this.#report = report;
    this.#offset = 0;
  }

  hints(): string {
    return LABELS.hints;
  }

  render(viewport: Viewport): readonly Line[] {
    if (!this.#report) return placeholder(LABELS.loading);
    const lines = this.allLines(viewport.width);
    // The last screenful is as far as the list goes, whatever was scrolled:
    // past it, PageDown would leave one line on an empty panel. Kept, so the
    // next PageUp moves at once. The list also shrinks when the incompatible
    // group is hidden.
    this.#offset = Math.min(this.#offset, Math.max(0, lines.length - viewport.height));
    return lines.slice(this.#offset, this.#offset + viewport.height);
  }

  press(key: KeyPress): void {
    const step = SCROLL_STEPS[key.name];
    if (step !== undefined) this.scroll(step);
  }

  click(): void {}

  scroll(step: number): void {
    // Bounded by the list here, by the last screenful at the next render.
    const lastLine = this.allLines(Number.POSITIVE_INFINITY).length - 1;
    this.#offset = Math.max(0, Math.min(this.#offset + step, lastLine));
  }

  private allLines(width: number): Line[] {
    if (!this.#report) return [];
    const report = this.#showIncompatible() ? this.#report : { ...this.#report, incompatible: [] };
    return [
      ...summaryLines(report, width),
      [],
      ...detectedLines(report.detected),
      [],
      ...missingLines(report.missing),
      ...incompatibleLines(report, width),
    ];
  }
}

/**
 * The summary on as few lines as the width allows, breaking between its
 * parts only: an 80-column terminal still shows "14 incompatible(s) avec
 * Windows" whole, on a second line.
 */
function summaryLines(report: ProviderStatusReport, width: number): Line[] {
  const rows: string[] = [];
  for (const part of providersSummaryParts(report)) {
    const last = rows.at(-1);
    const joined = last === undefined ? part : `${last}${LABELS.summarySeparator}${part}`;
    if (last !== undefined && joined.length <= width) rows[rows.length - 1] = joined;
    else rows.push(part);
  }
  return rows.map((row): Line => [seg(row, "muted")]);
}

/** The name cut to its column, then a gap: a name as wide as the column never touches the id. */
function nameCell(name: string, width: number = NAME_WIDTH): string {
  return `${fit(name, width)}${" ".repeat(COLUMN_GAP)}`;
}

function detectedLines(detected: readonly ProviderSummary[]): Line[] {
  const glyph = STATUS_GLYPHS.enabled;
  return [
    [seg(`${glyph} `, "success"), seg(LABELS.detected(detected.length), "strong")],
    ...detected.map((p): Line => [
      seg(`  ${glyph} `, "success"),
      seg(nameCell(p.displayName)),
      seg(p.id, "muted"),
    ]),
  ];
}

function missingLines(missing: readonly ProviderSummary[]): Line[] {
  const glyph = STATUS_GLYPHS.disabled;
  return [
    [seg(`${glyph} `, "muted"), seg(LABELS.missing(missing.length), "strong")],
    ...missing.flatMap((p): Line[] => [
      [seg(`  ${glyph} `, "muted"), seg(nameCell(p.displayName)), seg(p.id, "muted")],
      ...(p.installHint ? [[seg(`${HINT_PREFIX}${p.installHint}`, "muted")]] : []),
    ]),
  ];
}

/**
 * The providers foreign to this OS: every row in the `disabled` tone, and the
 * glyph, the header and the "<OS> uniquement" badge say it without colour
 * (conhost renders no faint text). No install hint — the badge is the
 * information. Nothing at all when the group is empty.
 */
function incompatibleLines(report: ProviderStatusReport, width: number): Line[] {
  const { platform, incompatible } = report;
  if (incompatible.length === 0) return [];
  const header = LABELS.incompatible(platform, incompatible.length);
  return [
    [],
    [seg(`${STATUS_GLYPHS.incompatible} `, "disabled"), seg(header, "strong")],
    ...wrap(LABELS.incompatibleNote, width - NOTE_INDENT.length).map(
      (line): Line => [seg(`${NOTE_INDENT}${line}`, "muted")],
    ),
    ...incompatibleRows(incompatible, width),
  ];
}

/**
 * One row per provider, the columns sized for the whole group so the badges
 * line up; on a narrow panel the names give way first, so the badge — what
 * the row is about — stays whole.
 */
function incompatibleRows(incompatible: readonly ProviderSummary[], width: number): Line[] {
  const rows = incompatible.map((p) => ({ ...p, badge: supportLabel(p.platforms ?? []) }));
  const idWidth = Math.max(...rows.map((row) => row.id.length)) + COLUMN_GAP;
  const badgeWidth = Math.max(...rows.map((row) => row.badge.length));
  const room = width - ROW_PREFIX_WIDTH - COLUMN_GAP - idWidth - badgeWidth;
  const nameWidth = Math.max(MIN_NAME_WIDTH, Math.min(NAME_WIDTH, room));
  return rows.map((row): Line => [
    seg(`  ${STATUS_GLYPHS.incompatible} `, "disabled"),
    seg(nameCell(row.displayName, nameWidth), "disabled"),
    seg(fit(row.id, idWidth), "disabled"),
    seg(row.badge, "disabled"),
  ]);
}
