/** One local day of the year of history the fixture machine has. */
export interface FixtureDay {
  /** 0 for the oldest day, 364 for the day the screenshots are taken. */
  readonly index: number;
  readonly year: number;
  /** 0-based, as `Date` counts them. */
  readonly month: number;
  readonly date: number;
  /** `20260915`, from {@link localDayKey}. */
  readonly key: string;
  /** Whether the fixture user used gup that day (not on Sundays, nor on holiday). */
  readonly isActive: boolean;
}

/** A local time of day. */
export interface LocalTime {
  readonly hour: number;
  readonly minute: number;
  readonly second?: number;
}

/** A year of history: the Journal opens on twelve months, its heatmap spans 53 weeks. */
const HISTORY_DAYS = 365;
const SUNDAY = 0;
/** The fixture user's summer break: two weeks without gup. */
const HOLIDAY = { from: "20260803", to: "20260816" } as const;
const KEY_PAD = 2;

/**
 * The local days of the year ending on `now`'s day, oldest first. Local, as
 * the Journal counts them: every date is built in the process's time zone
 * (Europe/Paris in the generator), so a day is the user's day, DST included.
 */
export function fixtureDays(now: Date): FixtureDay[] {
  return Array.from({ length: HISTORY_DAYS }, (_, index) => {
    const daysAgo = HISTORY_DAYS - 1 - index;
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
    const key = localDayKey(day);
    const isHoliday = key >= HOLIDAY.from && key <= HOLIDAY.to;
    return {
      index,
      year: day.getFullYear(),
      month: day.getMonth(),
      date: day.getDate(),
      key,
      isActive: day.getDay() !== SUNDAY && !isHoliday,
    };
  });
}

/** The local day of `date` as `YYYYMMDD`: the start of the runs' ids that day. */
export function localDayKey(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(KEY_PAD, "0"))
    .join("");
}

/** `day` at a local time of day. */
export function atLocalTime(day: FixtureDay, time: LocalTime): Date {
  return new Date(day.year, day.month, day.date, time.hour, time.minute, time.second ?? 0);
}
