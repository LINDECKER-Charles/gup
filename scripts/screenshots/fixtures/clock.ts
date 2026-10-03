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
} as const;
