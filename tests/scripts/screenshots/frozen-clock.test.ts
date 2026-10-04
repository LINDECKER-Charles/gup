import { describe, expect, it, onTestFinished } from "vitest";
import { freezeClock, stepFrameClock } from "../../../scripts/screenshots/sandbox/frozen-clock.js";

const NOW = new Date("2026-09-15T09:30:00.000Z");
/** Long enough, in real time, for a 1 ms interval to have fired many times. */
const REAL_WAIT_MS = 30;

function realDelay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("freezeClock", () => {
  it("stops Date and the frame clock at the instant, and lets timeouts run", async () => {
    onTestFinished(freezeClock(NOW));
    let ticks = 0;
    const frameClock = setInterval(() => ticks++, 1);
    onTestFinished(() => clearInterval(frameClock));
    // OpenTUI flushes frames through setTimeout: it must still fire.
    await realDelay(REAL_WAIT_MS);
    expect(ticks).toBe(0);
    expect(Date.now()).toBe(NOW.getTime());
    expect(new Date().toISOString()).toBe(NOW.toISOString());
  });

  it("steps the frame clock by exactly one frame on demand", () => {
    onTestFinished(freezeClock(NOW));
    const frameMs = 100;
    let ticks = 0;
    const frameClock = setInterval(() => ticks++, frameMs);
    onTestFinished(() => clearInterval(frameClock));
    stepFrameClock();
    expect(ticks).toBe(1);
    expect(Date.now()).toBe(NOW.getTime() + frameMs);
  });

  it("gives the real clock back when thawed", async () => {
    const past = new Date("2001-01-01T00:00:00.000Z");
    freezeClock(past)();
    let ticks = 0;
    const timer = setInterval(() => ticks++, 1);
    onTestFinished(() => clearInterval(timer));
    await realDelay(REAL_WAIT_MS);
    expect(ticks).toBeGreaterThan(0);
    expect(Date.now()).toBeGreaterThan(past.getTime());
  });
});
