import { adjustedRoles } from "../../../theme/enforce-contrast.js";
import { STATUS_GLYPHS } from "../../../theme/glyphs.js";
import { THEME_IDS, type ThemeId } from "../../../theme/palette.js";
import type { ResolvedTheme, ThemeAvailability } from "../../../theme/resolve-theme.js";
import {
  contrastStatus,
  formatRatioValue,
  THEME_DESCRIPTIONS,
  THEME_LABELS,
  THEME_PICKER,
} from "../../../text/settings/theme-labels.js";
import { ListCursor } from "../../../tui/list-cursor.js";
import type { KeyPress } from "../../../tui/screen-host.js";
import {
  fillLine,
  fit,
  lineWidth,
  seg,
  wrap,
  type Line,
  type Segment,
} from "../../../tui/styled-lines.js";
import type { Viewport } from "../../panel.js";
import type { OptionsControls, OptionsHost, OptionsView } from "../option-row.js";
import { clipLine } from "../settings-list.js";
import { themeSample } from "./theme-sample.js";

export interface ThemePickerDeps {
  readonly controls: OptionsControls;
  readonly host: OptionsHost;
}

const LABEL_WIDTH = 22;
/** Gutter, label, a space and the mark ("√ 6,1"). */
const LIST_WIDTH = 31;
const COLUMN_SEPARATOR = " │ ";
/** Narrower than this, the preview goes under the list. */
const SIDE_BY_SIDE_MIN = 66;
/** Under a narrow panel's list, the preview keeps the rest of the height. */
const NARROW_LIST_SHARE = 0.5;
/** The list's heading and three themes, however short the panel. */
const MIN_LIST_HEIGHT = 4;
const UP_KEYS: ReadonlySet<string> = new Set(["up", "k"]);
const DOWN_KEYS: ReadonlySet<string> = new Set(["down", "j"]);
const APPLY_KEYS: ReadonlySet<string> = new Set(["return", "enter", "space"]);
const CANCEL_KEYS: ReadonlySet<string> = new Set(["escape", "left"]);

/**
 * Every theme, with whether this terminal can paint it and its lowest
 * contrast; a list taller than the panel scrolls to keep the cursor in view.
 * The theme under the cursor is painted on the whole app at once (a preview,
 * nothing saved); Entrée saves it, Échap goes back to the saved one. A
 * preview the user leaves open while browsing other views stays on screen
 * (the title bar says it is not saved) until they come back.
 */
export class ThemePicker implements OptionsView {
  readonly title = THEME_PICKER.title;
  readonly #deps: ThemePickerDeps;
  #cursor: number;

  constructor(deps: ThemePickerDeps) {
    this.#deps = deps;
    this.#cursor = Math.max(0, THEME_IDS.indexOf(deps.host.settings.get("theme").id));
  }

  hints(): string {
    return THEME_PICKER.hints;
  }

  /**
   * The preview beside the list, or under it on a narrow panel — there the
   * contrast verdict comes before the sample, since a short panel cuts the end.
   */
  render(viewport: Viewport): readonly Line[] {
    const availability = this.#deps.host.appearance.availability();
    const list = this.listLines(availability, listHeight(viewport));
    if (viewport.width >= SIDE_BY_SIDE_MIN) {
      const previewWidth = viewport.width - LIST_WIDTH - COLUMN_SEPARATOR.length;
      const { intro, sample, report, note } = this.preview(availability, previewWidth);
      return sideBySide(list, separated([intro, sample, [...report, ...note]]), viewport.width);
    }
    const { intro, sample, report, note } = this.preview(availability, viewport.width);
    const below = separated([[...intro, ...report], sample, note]);
    return [...list, [], ...below].slice(0, viewport.height);
  }

  press(key: KeyPress): void {
    if (UP_KEYS.has(key.name)) this.moveTo(this.#cursor - 1);
    else if (DOWN_KEYS.has(key.name)) this.moveTo(this.#cursor + 1);
    else if (APPLY_KEYS.has(key.name)) this.apply();
    else if (CANCEL_KEYS.has(key.name)) this.cancel();
  }

  /** A click on a theme tries it, as the arrows do. */
  click(row: number, viewport: Viewport): void {
    const { start, end } = this.visibleRange(listHeight(viewport));
    const index = start + row - 1;
    if (row >= 1 && index < end) this.moveTo(index);
  }

  private get current(): ThemeId {
    return THEME_IDS[this.#cursor] ?? "terminal";
  }

  private isAvailable(id: ThemeId): boolean {
    const entry = this.#deps.host.appearance.availability().find((theme) => theme.id === id);
    return entry?.isAvailable ?? false;
  }

  /**
   * Paint the theme under the cursor on the whole app. The saved one needs no
   * preview, and one this terminal cannot paint is not previewed.
   */
  private moveTo(index: number): void {
    const { settings, appearance } = this.#deps.host;
    this.#cursor = Math.min(THEME_IDS.length - 1, Math.max(0, index));
    const saved = settings.get("theme");
    if (this.current === saved.id || !this.isAvailable(this.current)) appearance.endPreview();
    else appearance.preview({ ...saved, id: this.current });
  }

  private apply(): void {
    const { controls, host } = this.#deps;
    if (!this.isAvailable(this.current)) return;
    const id = this.current;
    controls.save(() => host.settings.update("theme", { id }));
    host.appearance.endPreview();
    controls.close();
  }

  private cancel(): void {
    this.#deps.host.appearance.endPreview();
    this.#deps.controls.close();
  }

  /** The themes shown in a list of `height` lines, heading included: the cursor's neighbours. */
  private visibleRange(height: number): { start: number; end: number } {
    const cursor = new ListCursor(
      THEME_IDS.map(() => true),
      this.#cursor,
    );
    return cursor.window(Math.max(1, height - 1));
  }

  private listLines(availability: readonly ThemeAvailability[], height: number): Line[] {
    const { start, end } = this.visibleRange(height);
    const rows = availability.slice(start, end).map((entry, offset): Line => {
      const isCursor = start + offset === this.#cursor;
      const line: Line = [
        seg(isCursor ? "› " : "  ", "accent"),
        seg(fit(THEME_LABELS[entry.id], LABEL_WIDTH), entry.isAvailable ? "plain" : "disabled"),
        seg(" "),
        markOf(entry),
      ];
      return isCursor ? fillLine(line, LIST_WIDTH, "highlight") : line;
    });
    return [[seg(THEME_PICKER.listHeading, "strong")], ...rows];
  }

  /** The theme under the cursor: what it is, the sample painted with it, how readable it is. */
  private preview(availability: readonly ThemeAvailability[], width: number): Preview {
    const heading: Line = [seg(THEME_PICKER.previewHeading, "strong")];
    if (availability[this.#cursor]?.isAvailable === false) {
      const intro = [heading, [seg(THEME_PICKER.unavailable, "disabled")]];
      return { intro, sample: [], report: [], note: [] };
    }
    const theme = this.#deps.host.appearance.resolved();
    return {
      intro: [heading, ...wrapped(THEME_DESCRIPTIONS[this.current], width, "muted")],
      sample: themeSample(width),
      report: reportLines(theme, width),
      note: wrapped(THEME_PICKER.modeNotes[theme.mode], width, "muted"),
    };
  }
}

/** The blocks of the preview, each a few lines. */
interface Preview {
  readonly intro: Line[];
  readonly sample: Line[];
  readonly report: Line[];
  readonly note: Line[];
}

/** Lines the list gets, heading included: the whole height beside the preview, a share above it. */
function listHeight(viewport: Viewport): number {
  if (viewport.width >= SIDE_BY_SIDE_MIN) return viewport.height;
  return Math.max(MIN_LIST_HEIGHT, Math.floor(viewport.height * NARROW_LIST_SHARE));
}

/** The non-empty blocks, a blank row between two. */
function separated(blocks: readonly Line[][]): Line[] {
  return blocks
    .filter((block) => block.length > 0)
    .flatMap((block, index) => (index === 0 ? block : [[], ...block]));
}

/** "√ 6,1" (corrected: "‼ 4,5"), "? —" when the contrast cannot be computed, "–" unavailable. */
function markOf(entry: ThemeAvailability): Segment {
  if (!entry.isAvailable) return seg("–", "disabled");
  const { success, warning } = STATUS_GLYPHS;
  if (entry.mode === "monochrome") return seg(`${success} —`, "success");
  if (entry.minTextRatio === null) return seg("? —", "warning");
  const ratio = formatRatioValue(entry.minTextRatio);
  if (entry.isCorrected) return seg(`${warning} ${ratio}`, "warning");
  return seg(`${success} ${ratio}`, "success");
}

function reportLines(theme: ResolvedTheme, width: number): Line[] {
  const { minTextRatio, level, corrections } = theme.report;
  if (minTextRatio === null) {
    const status = contrastStatus(theme);
    return wrapped(status.text, width, status.tone);
  }
  const report: Line = [seg(THEME_PICKER.report(minTextRatio, level), "success")];
  const adjusted = adjustedRoles(corrections).length;
  if (adjusted === 0) return [report];
  return [report, ...wrapped(THEME_PICKER.corrections(adjusted), width, "warning")];
}

function wrapped(text: string, width: number, tone: Segment["tone"]): Line[] {
  return wrap(text, Math.max(1, width)).map((part): Line => [seg(part, tone)]);
}

/** The list on the left, a separator, the preview on the right. */
function sideBySide(left: readonly Line[], right: readonly Line[], width: number): Line[] {
  const rightWidth = width - LIST_WIDTH - COLUMN_SEPARATOR.length;
  return Array.from({ length: Math.max(left.length, right.length) }, (_, row): Line => {
    const cell = clipLine(left[row] ?? [], LIST_WIDTH);
    const padding = seg(" ".repeat(LIST_WIDTH - lineWidth(cell)));
    const preview = clipLine(right[row] ?? [], rightWidth);
    return [...cell, padding, seg(COLUMN_SEPARATOR, "muted"), ...preview];
  });
}
