import { parseMonthDay } from "../../../core/scheduler/model/recurrence.js";
import { parseTarget } from "../../../core/scheduler/model/schedule-target.js";
import type { Recurrence, Weekday } from "../../../core/scheduler/model/types.js";
import {
  ADD_TARGET_DIALOG,
  EDITOR_TEXT,
  FREQUENCY_DIALOG,
  FREQUENCY_LABELS,
  MONTH_DAY_DIALOG,
  WEEKDAY_DIALOG,
} from "../../text/schedule/schedule-editor-labels.js";
import { recurrenceLabel, WEEKDAY_NAMES } from "../../text/schedule/schedule-labels.js";
import { SCHEDULE_NOTICES } from "../../text/schedule/schedule-menu-labels.js";
import { seg } from "../../tui/styled-lines.js";
import type { FlowContext } from "./flow-context.js";
import type { ScheduleEditor } from "./schedule-editor.js";
import type { EditorHandlers } from "./schedules-panel.js";

/**
 * The editor's dialogs — frequency, day, a package to add, leaving with
 * changes — and saving: refused while a field has a problem, preceded by
 * the one-time consent when it is the first schedule to need the OS
 * trigger, followed by the trigger brought in line.
 */

const FREQUENCIES: readonly Recurrence["kind"][] = ["daily", "weekly", "monthly", "cron"];
/** The days as the weekday chooser lists them, Monday first (ISO 8601), in every language. */
const WEEK: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 0];

export class EditorFlows implements EditorHandlers {
  readonly #kit: FlowContext;

  constructor(kit: FlowContext) {
    this.#kit = kit;
  }

  async chooseFrequency(editor: ScheduleEditor): Promise<void> {
    const kind = await this.#kit.view.dialogs.choose({
      title: FREQUENCY_DIALOG.title,
      choices: FREQUENCIES.map((value) => ({ label: FREQUENCY_LABELS[value], value })),
      default: editor.kind,
    });
    if (kind !== undefined) editor.setKind(kind);
    this.#kit.view.redraw();
  }

  async chooseDay(editor: ScheduleEditor): Promise<void> {
    if (editor.kind === "weekly") await this.#chooseWeekday(editor);
    else if (editor.kind === "monthly") await this.#askMonthDay(editor);
    this.#kit.view.redraw();
  }

  async addTarget(editor: ScheduleEditor): Promise<void> {
    const text = await this.#kit.view.dialogs.ask({
      title: ADD_TARGET_DIALOG.title,
      text: [ADD_TARGET_DIALOG.text],
      validate: (value) => this.#targetProblem(editor, value) ?? true,
    });
    const parsed = text === undefined ? null : parseTarget(text);
    if (parsed?.ok) editor.addTarget(parsed.target);
    this.#kit.view.redraw();
  }

  async save(editor: ScheduleEditor): Promise<void> {
    const { port } = this.#kit;
    const draft = editor.draft();
    const issues = [...editor.ownIssues(), ...port.validate(draft, editor.id)];
    if (issues.length > 0) return this.#kit.notify([[seg(EDITOR_TEXT.fixFirst, "danger")]]);
    if (draft.enabled && !(await this.#kit.consent())) return this.#kit.view.redraw();
    const { id } = editor;
    const outcome = await this.#kit.change(
      () => (id === undefined ? port.create(draft) : port.replace(id, draft)),
      (saved) => {
        const text = id === undefined
          ? SCHEDULE_NOTICES.created(saved.name, recurrenceLabel(saved.recurrence))
          : SCHEDULE_NOTICES.saved(saved.name);
        return [seg(text, "success")];
      },
    );
    if (!outcome.isSaved || !this.#kit.isLive) return;
    this.#close(editor);
    this.#kit.panel.select(outcome.schedule.id);
    this.#kit.view.redraw();
  }

  /** Esc, like q, may be pressed by mistake: a new schedule always asks first. */
  async leave(editor: ScheduleEditor): Promise<void> {
    if (editor.hasUnsavedWork) await this.#closeOnceConfirmed(editor);
    else this.#closeNow(editor);
  }

  /** Cancel is the discard itself: it only asks when the user changed something. */
  async cancel(editor: ScheduleEditor): Promise<void> {
    if (editor.isDirty) await this.#closeOnceConfirmed(editor);
    else this.#closeNow(editor);
  }

  async #closeOnceConfirmed(editor: ScheduleEditor): Promise<void> {
    if (await this.#kit.confirmDiscard(editor)) this.#close(editor);
    this.#kit.view.redraw();
  }

  #closeNow(editor: ScheduleEditor): void {
    this.#close(editor);
    this.#kit.view.redraw();
  }

  async #chooseWeekday(editor: ScheduleEditor): Promise<void> {
    const weekday = await this.#kit.view.dialogs.choose({
      title: WEEKDAY_DIALOG.title,
      choices: WEEK.map((value) => ({ label: WEEKDAY_NAMES[value], value })),
      default: editor.weekday,
    });
    if (weekday !== undefined) editor.setWeekday(weekday);
  }

  /** Typed rather than picked: 29 choices do not fit in a dialog on a small terminal. */
  async #askMonthDay(editor: ScheduleEditor): Promise<void> {
    const text = await this.#kit.view.dialogs.ask({
      title: MONTH_DAY_DIALOG.title,
      text: [MONTH_DAY_DIALOG.text],
      default: editor.monthDay === "last" ? MONTH_DAY_DIALOG.last : String(editor.monthDay),
      validate: (value) => parseMonthDay(value) !== null || MONTH_DAY_DIALOG.invalid,
    });
    const day = text === undefined ? null : parseMonthDay(text);
    if (day !== null) editor.setMonthDay(day);
  }

  /** Why `text` cannot be added to the schedule being edited, or null. */
  #targetProblem(editor: ScheduleEditor, text: string): string | null {
    const parsed = parseTarget(text);
    if (!parsed.ok) return parsed.reason;
    const targets = [...editor.targets, parsed.target];
    const field = `target:${editor.targets.length}`;
    const issues = this.#kit.port.validate({ ...editor.draft(), targets }, editor.id);
    return issues.find((issue) => issue.field === field)?.message ?? null;
  }

  /** The editor goes, unless another one replaced it meanwhile. */
  #close(editor: ScheduleEditor): void {
    if (this.#kit.panel.editor === editor) this.#kit.panel.closeEditor();
  }
}
