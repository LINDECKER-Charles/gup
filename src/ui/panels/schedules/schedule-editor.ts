import { DEFAULT_TIME, parseTimeOfDay } from "../../../core/scheduler/model/recurrence.js";
import { targetKey } from "../../../core/scheduler/model/schedule-target.js";
import type {
  MonthDay,
  Recurrence,
  Schedule,
  ScheduleDraft,
  ScheduleTarget,
  TimeOfDay,
  Weekday,
} from "../../../core/scheduler/model/types.js";
import {
  INVALID_TIME,
  MAX_NAME_LENGTH,
  type ValidationIssue,
} from "../../../core/scheduler/model/validate-schedule.js";
import { timeLabel } from "../../text/schedule-labels.js";

/**
 * The form behind "Nouvelle planification" and "Modifier": its fields, the
 * row under the cursor, the text being typed, the packages. Pure state —
 * the panel routes keys here and draws it, the flows open its dialogs and
 * save its draft. What is typed shows at once in the draft, so the
 * preview of the next runs follows every keystroke.
 */

export type TextField = "name" | "time" | "cron";
export type EditorField = TextField | "frequency" | "day" | "catchUp";

/** A row the cursor can stop on. */
export type EditorItem =
  | { readonly kind: "field"; readonly field: EditorField }
  | { readonly kind: "target"; readonly index: number }
  | { readonly kind: "add" | "save" | "cancel" };

export interface EditorSeed {
  /** The schedule edited; absent for a new one. */
  readonly id?: string;
  readonly draft: ScheduleDraft;
  /** A warning per target key, from the scan the package was picked in. */
  readonly notes?: ReadonlyMap<string, string>;
}

interface Typing {
  readonly field: TextField;
  readonly buffer: string;
}

const DEFAULT_WEEKDAY: Weekday = 1;
const DEFAULT_MONTH_DAY: MonthDay = 1;
/** Longest text each field accepts while typing. */
const MAX_TYPED: Readonly<Record<TextField, number>> = {
  name: MAX_NAME_LENGTH,
  time: "HH:MM".length,
  cron: 120,
};

export class ScheduleEditor {
  readonly id: string | undefined;
  readonly notes: ReadonlyMap<string, string>;
  #name: string;
  #kind: Recurrence["kind"];
  #weekday: Weekday = DEFAULT_WEEKDAY;
  #monthDay: MonthDay = DEFAULT_MONTH_DAY;
  #time: string;
  #cron = "";
  #catchUp: boolean;
  readonly #enabled: boolean;
  #targets: ScheduleTarget[];
  #cursor = 0;
  #typing: Typing | null = null;
  readonly #initial: string;

  constructor(seed: EditorSeed) {
    const { draft } = seed;
    this.id = seed.id;
    this.notes = seed.notes ?? new Map();
    this.#name = draft.name;
    this.#kind = draft.recurrence.kind;
    this.#time = timeLabel(DEFAULT_TIME);
    this.#catchUp = draft.options.catchUp;
    this.#enabled = draft.enabled;
    this.#targets = [...draft.targets];
    this.#adopt(draft.recurrence);
    this.#initial = this.#fingerprint();
  }

  /** The rows the cursor stops on, in order; the recurrence decides which fields show. */
  get items(): readonly EditorItem[] {
    const field = (name: EditorField): EditorItem => ({ kind: "field", field: name });
    const hasDay = this.#kind === "weekly" || this.#kind === "monthly";
    return [
      field("name"),
      field("frequency"),
      ...(hasDay ? [field("day")] : []),
      field(this.#kind === "cron" ? "cron" : "time"),
      field("catchUp"),
      ...this.#targets.map((_, index): EditorItem => ({ kind: "target", index })),
      { kind: "add" },
      { kind: "save" },
      { kind: "cancel" },
    ];
  }

  get cursor(): number {
    return this.#cursor;
  }

  get current(): EditorItem {
    return this.items[this.#cursor] ?? { kind: "save" };
  }

  move(delta: number): void {
    this.moveTo(this.#cursor + delta);
  }

  moveTo(index: number): void {
    this.#cursor = Math.max(0, Math.min(index, this.items.length - 1));
  }

  get kind(): Recurrence["kind"] {
    return this.#kind;
  }

  get weekday(): Weekday {
    return this.#weekday;
  }

  get monthDay(): MonthDay {
    return this.#monthDay;
  }

  get catchUp(): boolean {
    return this.#catchUp;
  }

  get targets(): readonly ScheduleTarget[] {
    return this.#targets;
  }

  /** The field being typed into, with what was typed so far. */
  get typing(): Typing | null {
    return this.#typing;
  }

  /** A text field's value as shown: what is being typed, else what is stored. */
  text(field: TextField): string {
    if (this.#typing?.field === field) return this.#typing.buffer;
    return { name: this.#name, time: this.#time, cron: this.#cron }[field];
  }

  /** Start typing into the field under the cursor; false when it is not a text field. */
  startTyping(): boolean {
    const item = this.current;
    if (item.kind !== "field" || !isTextField(item.field)) return false;
    this.#typing = { field: item.field, buffer: this.text(item.field) };
    return true;
  }

  type(characters: string): void {
    const typing = this.#typing;
    if (!typing) return;
    const buffer = `${typing.buffer}${characters}`;
    if (buffer.length <= MAX_TYPED[typing.field]) this.#typing = { ...typing, buffer };
  }

  erase(): void {
    const typing = this.#typing;
    if (typing) this.#typing = { ...typing, buffer: typing.buffer.slice(0, -1) };
  }

  /** Keep what was typed. */
  commitTyping(): void {
    const typing = this.#typing;
    if (!typing) return;
    if (typing.field === "name") this.#name = typing.buffer;
    else if (typing.field === "time") this.#time = typing.buffer.trim();
    else this.#cron = typing.buffer;
    this.#typing = null;
  }

  /** Drop what was typed. */
  cancelTyping(): void {
    this.#typing = null;
  }

  setKind(kind: Recurrence["kind"]): void {
    this.#kind = kind;
  }

  setWeekday(weekday: Weekday): void {
    this.#weekday = weekday;
  }

  setMonthDay(day: MonthDay): void {
    this.#monthDay = day;
  }

  toggleCatchUp(): void {
    this.#catchUp = !this.#catchUp;
  }

  /** Add a package; false when the schedule already has it. */
  addTarget(target: ScheduleTarget): boolean {
    const key = targetKey(target).toLowerCase();
    if (this.#targets.some((existing) => targetKey(existing).toLowerCase() === key)) return false;
    this.#targets = [...this.#targets, target];
    return true;
  }

  removeTarget(index: number): void {
    this.#targets = this.#targets.filter((_, i) => i !== index);
    this.moveTo(this.#cursor);
  }

  /** The schedule as the form stands, what is being typed included. */
  draft(): ScheduleDraft {
    return {
      name: this.text("name"),
      recurrence: this.#recurrence(),
      targets: this.#targets,
      enabled: this.#enabled,
      options: { catchUp: this.#catchUp },
    };
  }

  /** What the form itself refuses before any validation: a time that is not HH:MM. */
  ownIssues(): readonly ValidationIssue[] {
    if (this.#kind === "cron" || parseTimeOfDay(this.text("time"))) return [];
    return [{ field: "recurrence", message: INVALID_TIME }];
  }

  get isDirty(): boolean {
    return this.#fingerprint() !== this.#initial;
  }

  #recurrence(): Recurrence {
    const at = this.#at();
    switch (this.#kind) {
      case "daily":
        return { kind: "daily", at };
      case "weekly":
        return { kind: "weekly", weekday: this.#weekday, at };
      case "monthly":
        return { kind: "monthly", day: this.#monthDay, at };
      case "cron":
        return { kind: "cron", expression: this.text("cron") };
    }
  }

  /** The typed time, or the default while it does not parse (`ownIssues` says so). */
  #at(): TimeOfDay {
    return parseTimeOfDay(this.text("time")) ?? DEFAULT_TIME;
  }

  #adopt(recurrence: Recurrence): void {
    if (recurrence.kind === "cron") {
      this.#cron = recurrence.expression;
      return;
    }
    this.#time = timeLabel(recurrence.at);
    if (recurrence.kind === "weekly") this.#weekday = recurrence.weekday;
    if (recurrence.kind === "monthly") this.#monthDay = recurrence.day;
  }

  #fingerprint(): string {
    return JSON.stringify({ draft: this.draft(), time: this.text("time") });
  }
}

/** The editor's starting point for an existing schedule: its editable fields. */
export function seedOf(schedule: Schedule): EditorSeed {
  const { name, recurrence, targets, enabled, options } = schedule;
  return { id: schedule.id, draft: { name, recurrence, targets, enabled, options } };
}

function isTextField(field: EditorField): field is TextField {
  return field === "name" || field === "time" || field === "cron";
}
