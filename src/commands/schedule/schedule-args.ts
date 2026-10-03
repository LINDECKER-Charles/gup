import { NEVER_A_PROVIDER, parseTarget } from "../../core/scheduler/model/schedule-target.js";
import type {
  MonthDay,
  Recurrence,
  ScheduleDraft,
  ScheduleTarget,
  TimeOfDay,
  Weekday,
} from "../../core/scheduler/model/types.js";
import { MAX_NAME_LENGTH } from "../../core/scheduler/model/validate-schedule.js";
import type { Launcher } from "../../core/scheduler/trigger/os-trigger.js";

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

export const ADD_EXAMPLE = "  Exemple : gup schedule add winget:Git.Git --every daily";
/** A bare provider was given: the rule, then how to name a package. */
export const NOT_A_PACKAGE = `${NEVER_A_PROVIDER}\n${ADD_EXAMPLE}`;
export const DEFAULT_TIME: TimeOfDay = { hour: 9, minute: 0 };
const NO_TARGET = "au moins un paquet provider:paquet requis";

const WEEKDAYS: Readonly<Record<string, Weekday>> = {
  dim: 0, dimanche: 0, sun: 0, sunday: 0, "0": 0, "7": 0,
  lun: 1, lundi: 1, mon: 1, monday: 1, "1": 1,
  mar: 2, mardi: 2, tue: 2, tuesday: 2, "2": 2,
  mer: 3, mercredi: 3, wed: 3, wednesday: 3, "3": 3,
  jeu: 4, jeudi: 4, thu: 4, thursday: 4, "4": 4,
  ven: 5, vendredi: 5, fri: 5, friday: 5, "5": 5,
  sam: 6, samedi: 6, sat: 6, saturday: 6, "6": 6,
};
const LAST_DAY_WORDS = new Set(["dernier", "last"]);
const MONTH_DAY = /^(?:[1-9]|1\d|2[0-8])$/;
const TIME = /^(\d{1,2}):(\d{2})$/;
const MAX_HOUR = 23;
const MAX_MINUTE = 59;
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
      name: options.name?.trim() || defaultName(targets.value),
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
  return launcher ?? { error: `--launcher : headless ou direct attendu (reçu « ${value} »)` };
}

interface Parsed<T> {
  readonly value: T;
  readonly errors: readonly string[];
}

function parseTargets(texts: readonly string[]): Parsed<ScheduleTarget[]> {
  if (texts.length === 0) return { value: [], errors: [NO_TARGET] };
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
    return failed("--every et --cron s'excluent : choisissez l'un des deux");
  }
  if (cron !== undefined) return parseCron(options);
  if (every === undefined) {
    return failed('fréquence requise : --every <daily|weekly|monthly> ou --cron "<m h j mois js>"');
  }
  const preset = PRESETS.find((candidate) => candidate === every.toLowerCase());
  if (!preset) return failed(`--every : daily, weekly ou monthly attendu (reçu « ${every} »)`);
  const at = parseTime(options.at);
  if (!at) return failed(`--at : heure HH:MM attendue (reçu « ${options.at} »)`);
  return presetRecurrence(preset, { at, on: options.on });
}

function parseCron(options: AddOptions): Parsed<Recurrence | null> {
  if (options.on !== undefined || options.at !== undefined) {
    return failed("--on et --at ne s'appliquent pas à --cron : l'expression dit tout");
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
      : failed("--on ne s'applique qu'à --every weekly ou monthly");
  }
  if (preset === "weekly") {
    const weekday = on === undefined ? undefined : WEEKDAYS[on.toLowerCase()];
    if (weekday === undefined) return failed("--on : jour de la semaine attendu (lun, mar… dim)");
    return { value: { kind: "weekly", weekday, at }, errors: [] };
  }
  const day = parseMonthDay(on);
  if (day === null) return failed("--on : jour du mois attendu (1 à 28, ou dernier)");
  return { value: { kind: "monthly", day, at }, errors: [] };
}

function parseMonthDay(on: string | undefined): MonthDay | null {
  if (on === undefined) return null;
  const word = on.toLowerCase();
  if (LAST_DAY_WORDS.has(word)) return "last";
  return MONTH_DAY.test(word) ? Number(word) : null;
}

/** "HH:MM" (or "H:MM"), 09:00 when absent; null when malformed. */
function parseTime(text: string | undefined): TimeOfDay | null {
  if (text === undefined) return DEFAULT_TIME;
  const match = TIME.exec(text.trim());
  const hour = Number(match?.[1]);
  const minute = Number(match?.[2]);
  if (!match || hour > MAX_HOUR || minute > MAX_MINUTE) return null;
  return { hour, minute };
}

function failed(error: string): Parsed<null> {
  return { value: null, errors: [error] };
}

/** "Git.Git", "Git.Git +2" — the first package, and how many others. */
function defaultName(targets: readonly ScheduleTarget[]): string {
  const [first] = targets;
  const rest = targets.length - 1;
  const name = `${first?.packageId ?? "planification"}${rest > 0 ? ` +${rest}` : ""}`;
  return name.length > MAX_NAME_LENGTH ? `${name.slice(0, MAX_NAME_LENGTH - 1)}…` : name;
}
