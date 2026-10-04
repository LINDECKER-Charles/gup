/**
 * Numbers, durations and dates the way the French interface writes them,
 * for terminal output: always `fr-FR` (never the machine's locale), and
 * every narrow or non-breaking space turned into a plain one, so a string's
 * length is its width on screen. "now" is always passed in: the same input
 * gives the same text, in tests and in a long-running screen alike.
 */

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const COUNT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const PERCENT = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });
const SHORT_DAY = new Intl.DateTimeFormat("fr-FR", {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const NARROW_SPACES = /[  ]/g;

function plain(text: string): string {
  return text.replace(NARROW_SPACES, " ");
}

const pad2 = (value: number): string => String(value).padStart(2, "0");

/** `1284` → "1 284". */
export function formatCount(n: number): string {
  return plain(COUNT.format(n));
}

/**
 * "1 284 mises à jour", "1 paquet va": the count, then the words agreeing
 * with it — French plural, 0 and 1 take the singular.
 */
export function counted(count: number, one: string, many: string): string {
  return `${formatCount(count)} ${count <= 1 ? one : many}`;
}

/** `(6.14, 1)` → "6,1": exactly `digits` decimals, rounded. */
export function formatDecimal(value: number, digits: number): string {
  const format = new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return plain(format.format(value));
}

/** `0.97` → "97 %". */
export function formatPercent(ratio: number): string {
  return plain(PERCENT.format(ratio));
}

/** "18,4 s" under a minute, "2 min 14 s" under an hour, "1 h 05" beyond. */
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

/** "03/10/2026" (local time). */
export function formatDate(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

/** "03/10 14:22" (local time). */
export function formatDateTime(date: Date): string {
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)} ${timeOf(date)}`;
}

/**
 * When `date` is, seen from `now`. Past: "à l'instant", "il y a 4 min",
 * "il y a 3 h" (same day), "hier 09:03", "28/09 09:03". Future:
 * "aujourd'hui 14:00", "demain 09:00", "lun. 5 oct. 09:00". Another year
 * gets the full date.
 */
export function formatRelative(date: Date, now: Date): string {
  return date.getTime() <= now.getTime() ? relativePast(date, now) : relativeFuture(date, now);
}

function relativePast(date: Date, now: Date): string {
  const elapsedMs = now.getTime() - date.getTime();
  if (elapsedMs < MINUTE_MS) return "à l'instant";
  if (elapsedMs < HOUR_MS) return `il y a ${Math.floor(elapsedMs / MINUTE_MS)} min`;
  const days = dayDifference(date, now);
  if (days === 0) return `il y a ${Math.floor(elapsedMs / HOUR_MS)} h`;
  if (days === -1) return `hier ${timeOf(date)}`;
  return isSameYear(date, now) ? formatDateTime(date) : `${formatDate(date)} ${timeOf(date)}`;
}

function relativeFuture(date: Date, now: Date): string {
  const days = dayDifference(date, now);
  if (days === 0) return `aujourd'hui ${timeOf(date)}`;
  if (days === 1) return `demain ${timeOf(date)}`;
  if (!isSameYear(date, now)) return `${formatDate(date)} ${timeOf(date)}`;
  return `${plain(SHORT_DAY.format(date))} ${timeOf(date)}`;
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
