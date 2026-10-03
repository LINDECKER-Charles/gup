import { PREVIEW_RUNS, toCron, upcomingRuns } from "../../../core/scheduler/model/recurrence.js";
import { targetKey } from "../../../core/scheduler/model/schedule-target.js";
import {
  mayAskForUac,
  type IssueField,
  type ValidationIssue,
} from "../../../core/scheduler/model/validate-schedule.js";
import { STATUS_GLYPHS } from "../../theme/glyphs.js";
import { formatRelative } from "../../text/fr-format.js";
import { WINGET_UAC_NOTE } from "../../text/schedule-cli-labels.js";
import { WARNING_MARK, WEEKDAY_NAMES } from "../../text/schedule-labels.js";
import {
  CATCH_UP_VALUES,
  EDITOR_TEXT,
  FIELD_LABELS,
  FREQUENCY_LABELS,
  LAST_MONTH_DAY,
} from "../../text/schedule-menu-labels.js";
import { fillLine, fit, seg, wrap, type Line } from "../../tui/styled-lines.js";
import type { EditorField, EditorItem, ScheduleEditor } from "./schedule-editor.js";

/**
 * The editor drawn as lines: the fields, the preview of the next runs (or
 * why the recurrence is refused), the packages, the buttons. Each problem
 * shows under what it is about; "Enregistrer" is muted while there is one.
 */

export interface EditorRenderContext {
  /** What prevents saving, field by field. */
  readonly issues: readonly ValidationIssue[];
  readonly now: Date;
  readonly providerName: (providerId: string) => string;
  readonly width: number;
}

export interface EditorRender {
  readonly lines: readonly Line[];
  /** The line each item is drawn on, in item order. */
  readonly itemLines: readonly number[];
}

const MARGIN = "  ";
const CURSOR = "› ";
const LABEL_WIDTH = 17;
const PROVIDER_WIDTH = 14;
const PACKAGE_WIDTH = 24;
const TEXT_CURSOR = "█";

export function editorLines(editor: ScheduleEditor, context: EditorRenderContext): EditorRender {
  const lines: Line[] = [];
  const itemLines: number[] = [];
  editor.items.forEach((item, index) => {
    const isCursor = index === editor.cursor;
    lines.push(...before(item, { editor, context }));
    itemLines.push(lines.length);
    const marker = seg(isCursor ? CURSOR : MARGIN, "accent");
    const line: Line = [marker, ...itemLine(item, { editor, context })];
    lines.push(isCursor ? fillLine(line, context.width, "highlight") : line);
    lines.push(...after(item, { editor, context }));
  });
  return { lines, itemLines };
}

interface Drawing {
  readonly editor: ScheduleEditor;
  readonly context: EditorRenderContext;
}

/** What comes before an item: the targets heading, the gap before the buttons. */
function before(item: EditorItem, drawing: Drawing): Line[] {
  const { editor, context } = drawing;
  const isFirstTarget = item.kind === "target" && item.index === 0;
  if (isFirstTarget || (item.kind === "add" && editor.targets.length === 0)) {
    const heading: Line = [seg(`${MARGIN}${EDITOR_TEXT.targets(editor.targets.length)}`, "strong")];
    return [[], heading, ...issueLines(context, "targets")];
  }
  if (item.kind === "save") return [[], ...issueLines(context, "schedules")];
  return [];
}

/** What comes after an item: its problem, the preview after the last field, the UAC note. */
function after(item: EditorItem, drawing: Drawing): Line[] {
  const { editor, context } = drawing;
  if (item.kind === "field" && item.field === "name") return issueLines(context, "name");
  if (item.kind === "field" && item.field === "catchUp") return [[], previewLine(drawing)];
  if (item.kind === "add" && mayAskForUac(editor.targets)) {
    return wrap(WINGET_UAC_NOTE, context.width - MARGIN.length * 2).map((text): Line => [
      seg(`${MARGIN}${MARGIN}${text}`, "muted"),
    ]);
  }
  return [];
}

/** The item itself, after the cursor column. */
function itemLine(item: EditorItem, drawing: Drawing): Line {
  switch (item.kind) {
    case "field":
      return fieldLine(item.field, drawing.editor);
    case "target":
      return targetLine(item.index, drawing);
    case "add":
      return [seg(EDITOR_TEXT.addTarget, "accent")];
    case "save":
      return [seg(EDITOR_TEXT.save, drawing.context.issues.length > 0 ? "muted" : "accent")];
    case "cancel":
      return [seg(EDITOR_TEXT.cancel)];
  }
}

function fieldLine(field: EditorField, editor: ScheduleEditor): Line {
  const label = seg(fit(FIELD_LABELS[field], LABEL_WIDTH), "muted");
  if (editor.typing?.field === field) {
    return [label, seg(editor.typing.buffer, "strong"), seg(TEXT_CURSOR, "accent")];
  }
  const value: Line = [seg(`[${fieldValue(field, editor)}]`, "strong")];
  if (field !== "catchUp") return [label, ...value];
  return [label, ...value, seg(`   ${CATCH_UP_VALUES.help}`, "muted")];
}

function fieldValue(field: EditorField, editor: ScheduleEditor): string {
  switch (field) {
    case "name":
    case "time":
    case "cron":
      return editor.text(field);
    case "frequency":
      return FREQUENCY_LABELS[editor.kind];
    case "day":
      return dayValue(editor);
    case "catchUp":
      return editor.catchUp ? CATCH_UP_VALUES.on : CATCH_UP_VALUES.off;
  }
}

function dayValue(editor: ScheduleEditor): string {
  if (editor.kind === "weekly") return WEEKDAY_NAMES[editor.weekday];
  return editor.monthDay === "last" ? LAST_MONTH_DAY : String(editor.monthDay);
}

/** The cron expression and the next runs, or why the recurrence cannot be saved. */
function previewLine({ editor, context }: Drawing): Line {
  const problem = context.issues.find((issue) => issue.field === "recurrence");
  if (problem) return [seg(`${MARGIN}${STATUS_GLYPHS.failed} ${problem.message}`, "danger")];
  const { recurrence } = editor.draft();
  const runs = upcomingRuns(recurrence, context.now, PREVIEW_RUNS);
  const text = EDITOR_TEXT.preview(
    toCron(recurrence),
    runs.map((at) => formatRelative(at, context.now)),
  );
  return [seg(fit(`${MARGIN}${text}`, context.width), "muted")];
}

function targetLine(index: number, { editor, context }: Drawing): Line {
  const target = editor.targets[index];
  if (!target) return [];
  const problem = context.issues.find((issue) => issue.field === `target:${index}`);
  const note = editor.notes.get(targetKey(target));
  const remark: Line = problem
    ? [seg(`${STATUS_GLYPHS.failed} ${problem.message}`, "danger")]
    : note
      ? [seg(`${WARNING_MARK} ${note}`, "warning")]
      : [];
  return [
    seg(`${MARGIN}${fit(context.providerName(target.providerId), PROVIDER_WIDTH)} `),
    seg(`${fit(target.packageId, PACKAGE_WIDTH)} `, "strong"),
    ...remark,
  ];
}

function issueLines(context: EditorRenderContext, field: IssueField): Line[] {
  return context.issues
    .filter((issue) => issue.field === field)
    .map((issue): Line => [
      seg(`${MARGIN}${MARGIN}${STATUS_GLYPHS.failed} ${issue.message}`, "danger"),
    ]);
}
