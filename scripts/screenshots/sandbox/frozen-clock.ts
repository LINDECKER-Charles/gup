import { vi } from "vitest";

/**
 * The only timers a screenshot fakes. `Date` gives every view the fixture
 * instant; `setInterval` stops the menu's frame clock, so spinners stand on
 * their first frame. OpenTUI flushes frames through `setTimeout` and
 * `setImmediate`, which must stay real.
 */
const FAKED_TIMERS = ["Date", "setInterval", "clearInterval"] as const;

/** Stop the clock at `now`; returns the function that starts it again. */
export function freezeClock(now: Date): () => void {
  vi.useFakeTimers({ toFake: [...FAKED_TIMERS] });
  vi.setSystemTime(now);
  return () => void vi.useRealTimers();
}
