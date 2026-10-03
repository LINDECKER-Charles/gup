import {
  DEFAULT_TIME,
  parseMonthDay,
  parseTimeOfDay,
} from "../../core/scheduler/model/recurrence.js";
import { NEVER_A_PROVIDER, parseTarget } from "../../core/scheduler/model/schedule-target.js";
import type {
  Recurrence,
  ScheduleDraft,
  ScheduleTarget,
  TimeOfDay,
  Weekday,
} from "../../core/scheduler/model/types.js";
import { defaultScheduleName } from "../../core/scheduler/model/validate-schedule.js";
import type { Launcher } from "../../core/scheduler/trigger/os-trigger.js";
import { ARGUMENT_ERRORS, NOT_A_PACKAGE } from "../../ui/text/schedule-cli-labels.js";

/**
 * `gup schedule add` options → a schedule draft, or every reason it is not
 * one (French, exit code 2). Pure: validation that needs the registry or
 * the clock (`validateDraft`) comes after.
 */

export interface AddOptions {
  readonly targets: readonly string[];
  readonly every?: string;
  readonly on?: string;
  readonly at?: string;
  readonly cron?: string;
  readonly name?: string;
  /** `--no-catch-up` makes it false. */
  readonly catchUp: boolean;
  readonly disabled: boolean;
}

export type ParsedAdd =
  | { readonly ok: true; readonly draft: ScheduleDraft }
  | { readonly ok: false; readonly errors: readonly string[] };

const WEEKDAYS: Readonly<Record<string, Weekday>> = {
  dim: 0, dimanche: 0, sun: 0, sunday: 0, "0": 0, "7": 0,
  lun: 1, lundi: 1, mon: 1, monday: 1, "1": 1,
  mar: 2, mardi: 2, tue: 2, tuesday: 2, "2": 2,
  mer: 3, mercredi: 3, wed: 3, wednesday: 3, "3": 3,
  jeu: 4, jeudi: 4, thu: 4, thursday: 4, "4": 4,
  ven: 5, vendredi: 5, fri: 5, friday: 5, "5": 5,
  sam: 6, samedi: 6, sat: 6, saturday: 6, "6": 6,
};
const PRESETS = ["daily", "weekly", "monthly"] as const;
const LAUNCHERS: readonly Launcher[] = ["headless", "direct"];

export function parseAddArgs(options: AddOptions): ParsedAdd {
  const targets = parseTargets(options.targets);
  const recurrence = parseRecurrence(options);
  const errors = [...targets.errors, ...recurrence.errors];
  if (errors.length > 0 || !recurrence.value) return { ok: false, errors };
  return {
    ok: true,
    draft: {
      name: options.name?.trim() || defaultScheduleName(targets.value),
      recurrence: recurrence.value,
      targets: targets.value,
      enabled: !options.disabled,
      options: { catchUp: options.catchUp },
    },
  };
}

/** `--launcher` of `gup schedule install`. */
export function parseLauncher(
  value: string | undefined,
): Launcher | undefined | { readonly error: string } {
  if (value === undefined) return undefined;
  const launcher = LAUNCHERS.find((candidate) => candidate === value);
  return launcher ?? { error: ARGUMENT_ERRORS.launcher(value) };
}

interface Parsed<T> {
  readonly value: T;
  readonly errors: readonly string[];
}

function parseTargets(texts: readonly string[]): Parsed<ScheduleTarget[]> {
  if (texts.length === 0) return { value: [], errors: [ARGUMENT_ERRORS.noTarget] };
  const value: ScheduleTarget[] = [];
  const errors: string[] = [];
  for (const text of texts) {
    const parsed = parseTarget(text);
    if (parsed.ok) value.push(parsed.target);
    else errors.push(parsed.reason === NEVER_A_PROVIDER ? NOT_A_PACKAGE : parsed.reason);
  }
  return { value, errors: [...new Set(errors)] };
}

function parseRecurrence(options: AddOptions): Parsed<Recurrence | null> {
  const { every, cron } = options;
  if (every !== undefined && cron !== undefined) {
    return failed(ARGUMENT_ERRORS.bothFrequencies);
  }
  if (cron !== undefined) return parseCron(options);
  if (every === undefined) return failed(ARGUMENT_ERRORS.noFrequency);
  const preset = PRESETS.find((candidate) => candidate === every.toLowerCase());
  if (!preset) return failed(ARGUMENT_ERRORS.every(every));
  const at = parseTime(options.at);
  if (!at) return failed(ARGUMENT_ERRORS.at(options.at));
  return presetRecurrence(preset, { at, on: options.on });
}

function parseCron(options: AddOptions): Parsed<Recurrence | null> {
  if (options.on !== undefined || options.at !== undefined) {
    return failed(ARGUMENT_ERRORS.cronSaysAll);
  }
  return { value: { kind: "cron", expression: options.cron ?? "" }, errors: [] };
}

function presetRecurrence(
  preset: (typeof PRESETS)[number],
  choice: { readonly at: TimeOfDay; readonly on: string | undefined },
): Parsed<Recurrence | null> {
  const { at, on } = choice;
  if (preset === "daily") {
    return on === undefined
      ? { value: { kind: "daily", at }, errors: [] }
      : failed(ARGUMENT_ERRORS.onNotDaily);
  }
  if (preset === "weekly") {
    const weekday = on === undefined ? undefined : weekdayOf(on);
    if (weekday === undefined) return failed(ARGUMENT_ERRORS.weekday);
    return { value: { kind: "weekly", weekday, at }, errors: [] };
  }
  const day = on === undefined ? null : parseMonthDay(on);
  if (day === null) return failed(ARGUMENT_ERRORS.monthDay);
  return { value: { kind: "monthly", day, at }, errors: [] };
}

/** "lun", "monday", "1"… → that weekday; only the table's own words ("constructor" is none). */
function weekdayOf(text: string): Weekday | undefined {
  const word = text.toLowerCase();
  return Object.hasOwn(WEEKDAYS, word) ? WEEKDAYS[word] : undefined;
}

/** "HH:MM" (or "H:MM"), 09:00 when absent; null when malformed. */
function parseTime(text: string | undefined): TimeOfDay | null {
  return text === undefined ? DEFAULT_TIME : parseTimeOfDay(text);
}

function failed(error: string): Parsed<null> {
  return { value: null, errors: [error] };
}
