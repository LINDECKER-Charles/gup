import { activeLocale, INTL_LOCALES, type Locale } from "../../core/i18n/locale.js";
import { localized } from "../../core/i18n/localized.js";

/**
 * Numbers, durations and dates the way the interface writes them, in its
 * active language, for terminal output: an explicit Intl locale per language
 * (never the machine's), and every narrow or non-breaking space turned into a
 * plain one, so a string's length is its width on screen. "now" is always
 * passed in: the same input gives the same text, in tests and in a
 * long-running screen alike.
 *
 * English writes dates year first (2026-10-03) or with the month's name
 * (Oct 03), never as an ambiguous 10/03; French writes them day first.
 */

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const COUNT = byLocale((tag) => new Intl.NumberFormat(tag, { maximumFractionDigits: 0 }));
const PERCENT = byLocale(
  (tag) => new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 0 }),
);
const SHORT_DAY = byLocale(
  (tag) => new Intl.DateTimeFormat(tag, { weekday: "short", day: "numeric", month: "short" }),
);
/** The no-break space and the narrow no-break space Intl puts in French numbers. */
const NARROW_SPACES = /[  ]/g;

/** Three letters each, whatever Intl's data says ("Sept" in some locales): a fixed width. */
const ENGLISH_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const RELATIVE = localized({
  en: {
    justNow: "just now",
    minutesAgo: (minutes: number) => `${minutes} min ago`,
    hoursAgo: (hours: number) => `${hours} h ago`,
    yesterday: (time: string) => `yesterday ${time}`,
    today: (time: string) => `today ${time}`,
    tomorrow: (time: string) => `tomorrow ${time}`,
  },
  fr: {
    justNow: "à l'instant",
    minutesAgo: (minutes) => `il y a ${minutes} min`,
    hoursAgo: (hours) => `il y a ${hours} h`,
    yesterday: (time) => `hier ${time}`,
    today: (time) => `aujourd'hui ${time}`,
    tomorrow: (time) => `demain ${time}`,
  },
});

function byLocale<T>(create: (tag: string) => T): Readonly<Record<Locale, T>> {
  return { en: create(INTL_LOCALES.en), fr: create(INTL_LOCALES.fr) };
}

function plain(text: string): string {
  return text.replace(NARROW_SPACES, " ");
}

const pad2 = (value: number): string => String(value).padStart(2, "0");

/** `1284` → "1,284" in English, "1 284" in French. */
export function formatCount(n: number): string {
  return plain(COUNT[activeLocale()].format(n));
}

/**
 * The count, then the words agreeing with it: "1 package", "2 packages";
 * "1 paquet va", "1 284 paquets vont". English takes the singular for 1
 * only; French for 0 and 1.
 */
export function counted(count: number, one: string, many: string): string {
  const isSingular = activeLocale() === "fr" ? count <= 1 : count === 1;
  return `${formatCount(count)} ${isSingular ? one : many}`;
}

/** `(6.14, 1)` → "6.1" in English, "6,1" in French: exactly `digits` decimals, rounded. */
export function formatDecimal(value: number, digits: number): string {
  const format = new Intl.NumberFormat(INTL_LOCALES[activeLocale()], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return plain(format.format(value));
}

/** `0.97` → "97%" in English, "97 %" in French. */
export function formatPercent(ratio: number): string {
  return plain(PERCENT[activeLocale()].format(ratio));
}

/** "18.4 s" under a minute, "2 min 14 s" under an hour, "1 h 05" beyond. */
export function formatDuration(ms: number): string {
  const safe = Math.max(0, Number.isFinite(ms) ? ms : 0);
  const tenths = Math.round(safe / 100);
  if (tenths < 600) return `${formatDecimal(tenths / 10, 1)} s`;
  const seconds = Math.round(safe / SECOND_MS);
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${pad2(seconds % 60)} s`;
  const minutes = Math.round(safe / MINUTE_MS);
  return `${Math.floor(minutes / 60)} h ${pad2(minutes % 60)}`;
}

/** A running clock: "01:12" under an hour, "1:02:03" beyond. */
export function formatClock(ms: number): string {
  const seconds = Math.floor(Math.max(0, Number.isFinite(ms) ? ms : 0) / SECOND_MS);
  const hours = Math.floor(seconds / 3600);
  const minutesAndSeconds = `${pad2(Math.floor(seconds / 60) % 60)}:${pad2(seconds % 60)}`;
  return hours > 0 ? `${hours}:${minutesAndSeconds}` : minutesAndSeconds;
}

/** "2026-10-03" in English, "03/10/2026" in French (local time). */
export function formatDate(date: Date): string {
  const [year, month, day] = [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())];
  return activeLocale() === "fr" ? `${day}/${month}/${year}` : `${year}-${month}-${day}`;
}

/** "Oct 03 14:22" in English, "03/10 14:22" in French (local time). */
export function formatDateTime(date: Date): string {
  const day = pad2(date.getDate());
  const dayAndMonth =
    activeLocale() === "fr"
      ? `${day}/${pad2(date.getMonth() + 1)}`
      : `${ENGLISH_MONTHS[date.getMonth()] ?? ""} ${day}`;
  return `${dayAndMonth} ${timeOf(date)}`;
}

/**
 * When `date` is, seen from `now`. Past: "just now", "4 min ago", "3 h ago"
 * (same day), "yesterday 09:03", "Sep 28 09:03". Future: "today 14:00",
 * "tomorrow 09:00", "Mon, Oct 5 09:00". Another year gets the full date.
 */
export function formatRelative(date: Date, now: Date): string {
  return date.getTime() <= now.getTime() ? relativePast(date, now) : relativeFuture(date, now);
}

function relativePast(date: Date, now: Date): string {
  const elapsedMs = now.getTime() - date.getTime();
  if (elapsedMs < MINUTE_MS) return RELATIVE.justNow;
  if (elapsedMs < HOUR_MS) return RELATIVE.minutesAgo(Math.floor(elapsedMs / MINUTE_MS));
  const days = dayDifference(date, now);
  if (days === 0) return RELATIVE.hoursAgo(Math.floor(elapsedMs / HOUR_MS));
  if (days === -1) return RELATIVE.yesterday(timeOf(date));
  return isSameYear(date, now) ? formatDateTime(date) : `${formatDate(date)} ${timeOf(date)}`;
}

function relativeFuture(date: Date, now: Date): string {
  const days = dayDifference(date, now);
  if (days === 0) return RELATIVE.today(timeOf(date));
  if (days === 1) return RELATIVE.tomorrow(timeOf(date));
  if (!isSameYear(date, now)) return `${formatDate(date)} ${timeOf(date)}`;
  return `${plain(SHORT_DAY[activeLocale()].format(date))} ${timeOf(date)}`;
}

function timeOf(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function isSameYear(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear();
}

/** Calendar days from `now`'s day to `date`'s day, local time: -1 yesterday, 1 tomorrow. */
function dayDifference(date: Date, now: Date): number {
  const midnight = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  // Rounded: a day across a DST change lasts 23 or 25 hours.
  return Math.round((midnight(date) - midnight(now)) / DAY_MS);
}
