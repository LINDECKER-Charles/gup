/** When and where every screenshot is taken. */
export const FIXTURE_CLOCK = {
  /** A Tuesday, 11:30 in Paris. */
  now: new Date("2026-09-15T09:30:00.000Z"),
  /**
   * Set through the generator's vitest `test.env`, which assigns it inside
   * the worker: Node honours that on Windows, where a shell-level `TZ` is
   * dropped (Git Bash) or ignored.
   */
  timeZone: "Europe/Paris",
  /**
   * The POSIX locale the generator's workers start in. ICU reads it once, at
   * its first use, for its default collation — the order of every list gup
   * sorts by name. A CI runner's `C.UTF-8` means ICU's POSIX collation, which
   * puts `Scoop` before `npm`; Windows takes the user's locale instead, where
   * any common one sorts these ASCII names alike.
   */
  locale: "fr_FR.UTF-8",
} as const;
