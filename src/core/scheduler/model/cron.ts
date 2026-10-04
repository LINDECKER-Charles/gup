import { Cron } from "croner";
import { localized } from "../../i18n/localized.js";

/**
 * A 5-field cron expression, evaluated in the machine's local time zone. The
 * only module that imports croner: a scheduling-semantics change in the
 * library meets one adapter and the behavioural tables of its tests.
 *
 * croner 10.0.1, verified: `mode: "5-part"` refuses 6- and 7-field patterns;
 * day-of-month and day-of-week combine with OR (Vixie cron) by default;
 * `nextRuns` is strictly after its reference and `previousRuns` strictly
 * before; a local time skipped by a DST change moves forward (02:30 → 03:30);
 * no timer exists without a callback. `previousRuns` throws on a pattern
 * that never matches (`0 9 31 2 *`), hence the guard around every call.
 */

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;

/** croner's refusals told to the user, in the interface's languages. */
const CRON_ERRORS = localized({
  en: {
    /** croner's field names, as a reason names them. */
    fields: {
      second: "the seconds",
      minute: "the minutes",
      hour: "the hours",
      day: "the day of the month",
      month: "the month",
      dayOfWeek: "the day of the week",
    } as Readonly<Record<string, string>>,
    invalidValue: (field: string, value: string) => `invalid value for ${field}: ${value}`,
    fieldCount: "5 fields expected: minute hour day-of-month month day-of-week",
    invalid: "invalid cron expression",
  },
  fr: {
    fields: {
      second: "les secondes",
      minute: "les minutes",
      hour: "les heures",
      day: "le jour du mois",
      month: "le mois",
      dayOfWeek: "le jour de la semaine",
    },
    invalidValue: (field, value) => `valeur invalide pour ${field} : ${value}`,
    fieldCount: "5 champs attendus : minute heure jour-du-mois mois jour-de-la-semaine",
    invalid: "expression cron invalide",
  },
});

const INVALID_VALUE = /Invalid value for (\w+): (.+)$/;
const WRONG_FIELD_COUNT = /exactly|requires/;

export type CronParse =
  | { readonly ok: true; readonly cron: CronExpression }
  | { readonly ok: false; readonly reason: string };

export class CronExpression {
  readonly #cron: Cron;

  private constructor(cron: Cron) {
    this.#cron = cron;
  }

  /** Parse a 5-field expression; the reason is for the user, in the active language. */
  static tryParse(expression: string): CronParse {
    try {
      return { ok: true, cron: new CronExpression(new Cron(expression, { mode: "5-part" })) };
    } catch (err) {
      return { ok: false, reason: reasonOf(err) };
    }
  }

  /** The next `count` occurrences strictly after `from`. */
  nextRuns(from: Date, count: number): Date[] {
    return guarded(() => this.#cron.nextRuns(count, from), []);
  }

  /** The first occurrence strictly after `from`, or null when it never fires again. */
  nextRun(from: Date): Date | null {
    return this.nextRuns(from, 1)[0] ?? null;
  }

  /** The latest occurrence at or before `atOrBefore`, or null. */
  latestRun(atOrBefore: Date): Date | null {
    // Occurrences fall on whole minutes: "at or before t" is "strictly before
    // the next whole second after t".
    const wholeSecond = Math.floor(atOrBefore.getTime() / SECOND_MS) * SECOND_MS;
    const reference = new Date(wholeSecond + SECOND_MS);
    return guarded(() => this.#cron.previousRuns(1, reference)[0] ?? null, null);
  }

  /** Smallest gap, in minutes, between the next `sample` occurrences; Infinity under two. */
  minGapMinutes(from: Date, sample: number): number {
    const runs = this.nextRuns(from, sample);
    let smallest = Infinity;
    for (let i = 1; i < runs.length; i++) {
      const gap = (runs[i]!.getTime() - runs[i - 1]!.getTime()) / MINUTE_MS;
      smallest = Math.min(smallest, gap);
    }
    return smallest;
  }
}

/** croner throws on some never-matching patterns: read that as "no occurrence". */
function guarded<T>(work: () => T, fallback: T): T {
  try {
    return work();
  } catch {
    return fallback;
  }
}

function reasonOf(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const invalid = INVALID_VALUE.exec(message);
  if (invalid) {
    // Both groups are mandatory: they are set whenever the pattern matched.
    const [, name = "", value = ""] = invalid;
    return CRON_ERRORS.invalidValue(CRON_ERRORS.fields[name] ?? name, value);
  }
  if (WRONG_FIELD_COUNT.test(message)) return CRON_ERRORS.fieldCount;
  return CRON_ERRORS.invalid;
}
